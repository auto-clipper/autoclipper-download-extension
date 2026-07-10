import { useEffect, useState } from 'react';
import type { BackgroundMessage, DownloadResponse, DownloadStatus, MediaItem } from '@/shared/types';

const t = (key: string, subs?: string[]) => chrome.i18n.getMessage(key, subs) || key;

const SITE_URL = 'https://autoclipper.live/?utm_source=chrome-extension&utm_medium=popup';

const SUPPORTED_HINT = 'Instagram · TikTok · X · Reddit';

export function App() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [pageUrl, setPageUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [statuses, setStatuses] = useState<Record<string, DownloadStatus>>({});

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

  const download = (url: string, filename: string) => {
    setStatuses((prev) => ({ ...prev, [url]: 'downloading' }));
    const resetIfDownloading = () =>
      setStatuses((prev) => {
        if (prev[url] !== 'downloading') return prev;
        const next = { ...prev };
        delete next[url];
        return next;
      });
    chrome.runtime
      .sendMessage({ type: 'download', url, filename })
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

  const buttonLabel = (url: string, idle: string) => {
    const status = statuses[url];
    if (status === 'downloading') {
      return (
        <>
          <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-current/30 border-t-current align-[-1px]" />{' '}
          {t('downloading')}
        </>
      );
    }
    if (status === 'complete') return t('saved');
    if (status === 'interrupted') return t('downloadError');
    return idle;
  };

  return (
    <div className="w-[360px] bg-[#0b0d11] text-[#f4f7fb] font-sans">
      <header className="flex items-center gap-2 px-4 py-3 border-b border-[#23262e]">
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

      <main className="max-h-[380px] overflow-y-auto">
        {loading ? (
          <p className="px-4 py-6 text-xs text-[#8a93a3]">…</p>
        ) : isYouTube ? (
          <a
            href={`https://autoclipper.live/?utm_source=chrome-extension&utm_medium=popup-youtube&video=${encodeURIComponent(pageUrl)}`}
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
              <li key={item.id} className="flex gap-3 px-4 py-3">
                {item.thumbnail && (
                  <img
                    src={item.thumbnail}
                    alt=""
                    className="h-12 w-12 flex-shrink-0 rounded-lg bg-[#1a1d24] object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-xs leading-snug">
                    {item.title || item.pageUrl}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#8a93a3]">
                    {[item.provider, item.quality].filter(Boolean).join(' · ')}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button
                      onClick={() => download(item.url, item.filename)}
                      disabled={statuses[item.url] === 'downloading'}
                      className="cursor-pointer rounded-lg bg-[#bfff00] px-3 py-1.5 text-xs font-bold text-[#0b0d11] hover:brightness-110 disabled:cursor-default disabled:opacity-75"
                    >
                      {buttonLabel(item.url, t('downloadVideo'))}
                    </button>
                    {item.audioUrl && (
                      <button
                        onClick={() =>
                          download(item.audioUrl!, item.filename.replace(/\.mp4$/, '-audio.mp4'))
                        }
                        disabled={statuses[item.audioUrl] === 'downloading'}
                        className="cursor-pointer rounded-lg bg-[#23262e] px-3 py-1.5 text-xs font-bold hover:brightness-125 disabled:cursor-default disabled:opacity-75"
                      >
                        {buttonLabel(item.audioUrl, t('downloadAudio'))}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>

      <footer className="border-t border-[#23262e] px-4 py-3">
        <a
          href={SITE_URL}
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

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}
