import { useEffect, useState } from 'react';
import type {
  AuthUser,
  BackgroundMessage,
  DownloadMeta,
  DownloadResponse,
  DownloadStatus,
  MediaItem,
} from '@/shared/types';
import { APP_URL, SITE_URL } from '@/shared/constants';
import { t, safeHostname, safePathname, sendToAppUrl } from './helpers';
import { MediaRow } from './MediaRow';
import { DownloadHistory } from './DownloadHistory';
import { ReviewPrompt } from './ReviewPrompt';

const POWERED_URL = `${SITE_URL}/?utm_source=chrome-extension&utm_medium=popup`;
const LOGIN_URL = `${APP_URL}/login?redirect=%2Fprojects&utm_source=chrome-extension&utm_medium=popup-login`;
const SUPPORTED_HINT = 'Instagram · TikTok · X · Reddit · Twitch';

export function App() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [pageUrl, setPageUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [statuses, setStatuses] = useState<Record<string, DownloadStatus>>({});
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    void chrome.storage.local.get('acAuth').then((stored) => {
      setAuthUser((stored.acAuth as AuthUser | null) ?? null);
    });
  }, []);

  useEffect(() => {
    const onMessage = (message: BackgroundMessage) => {
      if (message.type === 'download-status') {
        setStatuses((prev) => ({ ...prev, [message.url]: message.status }));
      }
    };
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, []);

  useEffect(() => {
    void (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      setPageUrl(tab?.url ?? '');
      if (tab?.id !== undefined) {
        const media = (await chrome.runtime.sendMessage({
          type: 'get-media',
          tabId: tab.id,
        })) as MediaItem[] | undefined;
        setItems(media ?? []);
      }
      setLoading(false);
    })();
  }, []);

  const isYouTube = /(^|\.)youtube\.com$/.test(safeHostname(pageUrl));
  const isWatchPage = isYouTube && /\/watch\b|\/live\//.test(safePathname(pageUrl));

  const download = (url: string, filename: string, meta: DownloadMeta) => {
    setStatuses((prev) => ({ ...prev, [url]: 'downloading' }));
    const resetIfDownloading = () =>
      setStatuses((prev) => {
        if (prev[url] !== 'downloading') return prev;
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
          setStatuses((prev) => ({ ...prev, [url]: 'interrupted' }));
        } else if (!response) {
          setTimeout(resetIfDownloading, 20_000);
        }
      })
      .catch(() => setTimeout(resetIfDownloading, 20_000));
  };

  return (
    <div className="w-[360px] bg-[#0b0d11] text-[#f4f7fb] font-sans">
      <header className="flex items-center gap-2 border-b border-[#23262e] px-4 py-3">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#bfff00] to-[#00e5ff]">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
            <path
              d="M12 3v10m0 0l-4-4m4 4l4-4"
              stroke="#0b0d11"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M5 17h14v3H5z" fill="#0b0d11" />
          </svg>
        </span>
        <h1 className="text-sm font-bold tracking-tight">
          AutoClipper <span className="text-[#bfff00]">Video Downloader</span>
        </h1>
      </header>

      <main className="max-h-[420px] overflow-y-auto">
        <ReviewPrompt />

        {loading ? (
          <p className="px-4 py-6 text-xs text-[#8a93a3]">…</p>
        ) : isWatchPage ? (
          <a
            href={sendToAppUrl(pageUrl, 'popup-send')}
            target="_blank"
            rel="noopener"
            className="m-4 block rounded-xl border border-[#bfff00]/40 bg-gradient-to-br from-[#bfff00]/10 to-[#00e5ff]/10 p-4 text-xs leading-relaxed no-underline"
          >
            <strong className="text-[#bfff00]">{t('sendToAutoclipperTitle')}</strong>
            <br />
            {t('sendToAutoclipperBody')}
          </a>
        ) : isYouTube ? (
          <a
            href={`${SITE_URL}/?utm_source=chrome-extension&utm_medium=popup-youtube&video=${encodeURIComponent(pageUrl)}`}
            target="_blank"
            rel="noopener"
            className="m-4 block rounded-xl border border-[#bfff00]/40 bg-gradient-to-br from-[#bfff00]/10 to-[#00e5ff]/10 p-4 text-xs leading-relaxed no-underline"
          >
            <strong className="text-[#bfff00]">{t('youtubeCtaTitle')}</strong>
            <br />
            {t('youtubeCtaBody')}
          </a>
        ) : items.length === 0 ? (
          <div className="px-4 py-6">
            <p className="text-xs leading-relaxed text-[#8a93a3]">{t('noVideosFound')}</p>
            <p className="mt-2 text-[11px] text-[#5c6470]">{SUPPORTED_HINT}</p>
          </div>
        ) : (
          <ul className="divide-y divide-[#1a1d24]">
            {items.map((item) => (
              <MediaRow
                key={item.id}
                item={item}
                status={statuses[item.url]}
                audioStatus={item.audioUrl ? statuses[item.audioUrl] : undefined}
                onDownload={download}
              />
            ))}
          </ul>
        )}

        <DownloadHistory />
      </main>

      <footer className="border-t border-[#23262e] px-4 py-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          {authUser ? (
            <a
              href={`${APP_URL}/projects?utm_source=chrome-extension&utm_medium=popup-account`}
              target="_blank"
              rel="noopener"
              className="flex min-w-0 items-center gap-2 text-xs text-[#8a93a3] no-underline hover:text-[#bfff00]"
            >
              <span className="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#bfff00] to-[#00e5ff] text-[10px] font-bold text-[#0b0d11]">
                {(authUser.username ?? authUser.email ?? '?').charAt(0).toUpperCase()}
              </span>
              <span className="truncate">
                {t('loggedInAs', [authUser.username ?? authUser.email ?? ''])}
              </span>
            </a>
          ) : (
            <a
              href={LOGIN_URL}
              target="_blank"
              rel="noopener"
              className="rounded-lg border border-[#bfff00]/50 px-3 py-1.5 text-xs font-bold text-[#bfff00] no-underline hover:bg-[#bfff00]/10"
            >
              {t('loginWithAutoclipper')}
            </a>
          )}
        </div>
        <a
          href={POWERED_URL}
          target="_blank"
          rel="noopener"
          className="text-xs font-semibold text-[#00e5ff] no-underline hover:underline"
        >
          {t('poweredBy')}
        </a>
      </footer>
    </div>
  );
}
