import { useEffect, useState } from 'react';
import type {
  AuthUser,
  BackgroundMessage,
  DownloadMeta,
  DownloadResponse,
  MediaItem,
  PageInfo,
} from '@/shared/types';
import {
  APP_URL,
  FAB_PREFS_KEY,
  INLINE_BUTTONS_KEY,
  SITE_URL,
  type FabPrefs,
} from '@/shared/constants';
import { t, safePathname, sendToAppUrl } from './helpers';
import { MediaRow, type StatusEntry } from './MediaRow';
import { DownloadHistory } from './DownloadHistory';
import { ReviewPrompt } from './ReviewPrompt';
import { UserAvatar } from './UserAvatar';

const POWERED_URL = `${SITE_URL}/?utm_source=chrome-extension&utm_medium=popup`;
const LOGIN_URL = `${APP_URL}/login?redirect=%2Fprojects&utm_source=chrome-extension&utm_medium=popup-login`;
const SUPPORTED_HINT = 'Instagram · TikTok · X · Reddit · Twitch';
const SUPPORTED_SITES: [string, string][] = [
  ['Instagram', 'https://www.instagram.com/reels/'],
  ['TikTok', 'https://www.tiktok.com/'],
  ['X', 'https://x.com/'],
  ['Reddit', 'https://www.reddit.com/'],
  ['Twitch', 'https://www.twitch.tv/directory'],
];

export function App() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [pageUrl, setPageUrl] = useState('');
  const [siteKey, setSiteKey] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [statuses, setStatuses] = useState<Record<string, StatusEntry>>({});
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [inlineButtons, setInlineButtons] = useState(true);
  const [fabPrefs, setFabPrefs] = useState<FabPrefs>({});
  const [shortcut, setShortcut] = useState('');

  useEffect(() => {
    void chrome.storage.local.get(['acAuth', INLINE_BUTTONS_KEY, FAB_PREFS_KEY]).then((stored) => {
      setAuthUser((stored.acAuth as AuthUser | null) ?? null);
      setInlineButtons(stored[INLINE_BUTTONS_KEY] !== false);
      setFabPrefs((stored[FAB_PREFS_KEY] as FabPrefs | undefined) ?? {});
    });
    // Empty when the user removed it or another extension took the keys.
    void chrome.commands.getAll().then((commands) => {
      setShortcut(commands.find((c) => c.name === 'download-video')?.shortcut ?? '');
    });
  }, []);

  const toggleInlineButtons = (enabled: boolean) => {
    setInlineButtons(enabled);
    // Content scripts listen on storage.onChanged and update open tabs live.
    void chrome.storage.local.set({ [INLINE_BUTTONS_KEY]: enabled });
  };

  useEffect(() => {
    const onMessage = (message: BackgroundMessage) => {
      if (message.type === 'download-status') {
        setStatuses((prev) => {
          const next = { ...prev };
          // Cancelled in Chrome's download UI: back to idle, not an error.
          if (message.status === 'canceled') delete next[message.url];
          else next[message.url] = { status: message.status, error: message.error };
          return next;
        });
      }
    };
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!active) return;
      if (tab?.id !== undefined) {
        const restored = await chrome.tabs
          .sendMessage(tab.id, { type: 'restore-panel' }, { frameId: 0 })
          .catch(() => false);
        if (!active) return;
        if (restored) {
          window.close();
          return;
        }

        // Ask the page itself (see PageInfo): no answer means an unsupported
        // site, or a supported tab still running a pre-update content script.
        const info = (await chrome.tabs
          .sendMessage(tab.id, { type: 'get-page-info' }, { frameId: 0 })
          .catch(() => undefined)) as PageInfo | undefined;
        setPageUrl(info?.url ?? '');
        setSiteKey(info?.siteKey);
        const media = (await chrome.runtime.sendMessage({
          type: 'get-media',
          tabId: tab.id,
        })) as MediaItem[] | undefined;
        setItems(media ?? []);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const isYouTube = siteKey === 'youtube';
  const isWatchPage = isYouTube && /\/watch\b|\/live\//.test(safePathname(pageUrl));
  const isSupported = Boolean(siteKey);
  const fabShown = !siteKey || !fabPrefs[siteKey]?.hidden;

  const toggleFab = (shown: boolean) => {
    if (!siteKey) return;
    const next = { ...fabPrefs, [siteKey]: { ...fabPrefs[siteKey], hidden: !shown } };
    setFabPrefs(next);
    // The page's content script listens on storage.onChanged.
    void chrome.storage.local.set({ [FAB_PREFS_KEY]: next });
  };

  const downloadAll = () => {
    items
      .filter((item) => {
        const status = statuses[item.url]?.status;
        return status !== 'downloading' && status !== 'complete';
      })
      .forEach((item, i) =>
        setTimeout(
          () =>
            download(item.url, item.filename, {
              provider: item.provider,
              title: item.title,
              pageUrl: item.pageUrl,
              audioUrl: item.audioUrl,
            }),
          i * 300,
        ),
      );
  };
  const pendingCount = items.filter((item) => {
    const status = statuses[item.url]?.status;
    return status !== 'downloading' && status !== 'complete';
  }).length;

  const download = (url: string, filename: string, meta: DownloadMeta) => {
    setStatuses((prev) => ({ ...prev, [url]: { status: 'downloading' } }));
    const resetIfDownloading = () =>
      setStatuses((prev) => {
        if (prev[url]?.status !== 'downloading') return prev;
        const next = { ...prev };
        delete next[url];
        return next;
      });
    chrome.runtime
      .sendMessage({ type: 'download', url, filename, now: Date.now(), meta })
      .then((response: DownloadResponse | undefined) => {
        // Only an explicit rejection means the download failed to start;
        // otherwise download-status events settle the outcome.
        if (response && !response.ok) {
          setStatuses((prev) => ({
            ...prev,
            [url]: { status: 'interrupted', error: response.error },
          }));
        } else if (!response) {
          setTimeout(resetIfDownloading, 20_000);
        }
      })
      .catch(() => setTimeout(resetIfDownloading, 20_000));
  };

  return (
    <div className="w-[360px] bg-[#0b100d] text-[#f3f5ea] font-sans">
      <header className="flex items-center gap-2 border-b border-[#262e29] px-4 py-3">
        <h1 className="flex w-full items-center justify-between gap-3">
          <img
            src={chrome.runtime.getURL('brand/wordmark.svg')}
            alt="Autoclipper"
            className="h-auto w-32"
          />
          <span className="text-xs font-bold text-[#a4aea6]">{t('popupTitle')}</span>
        </h1>
      </header>

      <main className="max-h-[420px] overflow-y-auto">
        <ReviewPrompt />

        {loading ? (
          <p className="px-4 py-6 text-xs text-[#a4aea6]">…</p>
        ) : isWatchPage ? (
          <a
            href={sendToAppUrl(pageUrl, 'popup-send')}
            target="_blank"
            rel="noopener"
            className="m-4 block rounded-xl border border-[#b5ff00]/40 bg-[#131915] p-4 text-xs leading-relaxed no-underline"
          >
            <strong className="text-[#b5ff00]">{t('sendToAutoclipperTitle')}</strong>
            <br />
            {t('sendToAutoclipperBody')}
          </a>
        ) : isYouTube ? (
          <a
            href={`${SITE_URL}/?utm_source=chrome-extension&utm_medium=popup-youtube&video=${encodeURIComponent(pageUrl)}`}
            target="_blank"
            rel="noopener"
            className="m-4 block rounded-xl border border-[#b5ff00]/40 bg-[#131915] p-4 text-xs leading-relaxed no-underline"
          >
            <strong className="text-[#b5ff00]">{t('youtubeCtaTitle')}</strong>
            <br />
            {t('youtubeCtaBody')}
          </a>
        ) : !isSupported ? (
          <div className="px-4 py-5">
            <p className="text-xs font-bold text-[#f3f5ea]">{t('unsupportedSiteTitle')}</p>
            <p className="mt-1 text-xs leading-relaxed text-[#a4aea6]">
              {t('unsupportedSiteBody')}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {SUPPORTED_SITES.map(([name, url]) => (
                <a
                  key={name}
                  href={url}
                  target="_blank"
                  rel="noopener"
                  className="rounded-lg border border-[#262e29] px-2.5 py-1 text-[11px] font-semibold text-[#d3dacf] no-underline hover:border-[#b5ff00]/50 hover:text-[#b5ff00]"
                >
                  {name}
                </a>
              ))}
            </div>
          </div>
        ) : items.length === 0 ? (
          <div className="px-4 py-6">
            <p className="text-xs leading-relaxed text-[#a4aea6]">{t('noVideosFound')}</p>
            <p className="mt-2 text-[11px] text-[#8d9a90]">{SUPPORTED_HINT}</p>
          </div>
        ) : (
          <>
            {items.length > 1 && (
              <div className="flex justify-end border-b border-[#1b221e] px-4 py-2">
                <button
                  onClick={downloadAll}
                  disabled={pendingCount === 0}
                  className="cursor-pointer rounded-lg bg-[#1b221e] px-3 py-1.5 text-xs font-bold text-[#b5ff00] hover:bg-[#262e29] disabled:cursor-default disabled:opacity-60"
                >
                  {t('downloadAll', [String(pendingCount)])}
                </button>
              </div>
            )}
            <ul className="divide-y divide-[#1b221e]">
              {items.map((item) => (
                <MediaRow key={item.id} item={item} statuses={statuses} onDownload={download} />
              ))}
            </ul>
          </>
        )}

        <DownloadHistory onDownload={download} statuses={statuses} />
      </main>

      <footer className="border-t border-[#262e29] px-4 py-3">
        <label className="mb-3 flex cursor-pointer items-center justify-between gap-3 text-xs text-[#a4aea6]">
          {t('inlineButtonsSetting')}
          <input
            type="checkbox"
            checked={inlineButtons}
            onChange={(event) => toggleInlineButtons(event.target.checked)}
            className="h-4 w-4 cursor-pointer accent-[#b5ff00]"
          />
        </label>
        {siteKey && (
          <label className="mb-3 flex cursor-pointer items-center justify-between gap-3 text-xs text-[#a4aea6]">
            {t('fabSetting')}
            <input
              type="checkbox"
              checked={fabShown}
              onChange={(event) => toggleFab(event.target.checked)}
              className="h-4 w-4 cursor-pointer accent-[#b5ff00]"
            />
          </label>
        )}
        {shortcut && siteKey !== 'youtube' && (
          <p className="mb-3 text-[11px] leading-snug text-[#8d9a90]">
            {t('shortcutTip', [shortcut])}
          </p>
        )}
        <div className="mb-2 flex items-center justify-between gap-2">
          {authUser ? (
            <a
              href={`${APP_URL}/projects?utm_source=chrome-extension&utm_medium=popup-account`}
              target="_blank"
              rel="noopener"
              className="flex min-w-0 items-center gap-2 text-xs text-[#a4aea6] no-underline hover:text-[#b5ff00]"
            >
              <UserAvatar user={authUser} />
              <span className="truncate">
                {t('loggedInAs', [authUser.username ?? authUser.email ?? ''])}
              </span>
            </a>
          ) : (
            <a
              href={LOGIN_URL}
              target="_blank"
              rel="noopener"
              className="rounded-lg border border-[#b5ff00]/50 px-3 py-1.5 text-xs font-bold text-[#b5ff00] no-underline hover:bg-[#b5ff00]/10"
            >
              {t('loginWithAutoclipper')}
            </a>
          )}
        </div>
        <a
          href={POWERED_URL}
          target="_blank"
          rel="noopener"
          className="text-xs font-semibold text-[#b5ff00] no-underline hover:underline"
        >
          {t('poweredBy')}
        </a>
      </footer>
    </div>
  );
}
