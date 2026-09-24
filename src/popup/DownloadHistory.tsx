import { useEffect, useState } from 'react';
import type { DownloadMeta, HistoryEntry } from '@/shared/types';
import { providerName } from '@/shared/labels';
import type { StatusEntry } from './MediaRow';
import { t } from './helpers';

interface DownloadHistoryProps {
  onDownload: (url: string, filename: string, meta: DownloadMeta) => void;
  statuses: Record<string, StatusEntry>;
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];

/** "2 min ago" / "yesterday" in the browser's UI language. */
function timeAgo(savedAt: number, now: number): string {
  const rtf = new Intl.RelativeTimeFormat(chrome.i18n.getUILanguage(), { numeric: 'auto' });
  const elapsed = savedAt - now;
  for (const [unit, ms] of UNITS) {
    if (Math.abs(elapsed) >= ms) return rtf.format(Math.round(elapsed / ms), unit);
  }
  return rtf.format(0, 'minute');
}

function entryTitle(entry: HistoryEntry): string {
  if (entry.title) return entry.title;
  if (entry.provider) return t('historyVideoFrom', [providerName(entry.provider)]);
  return entry.filename.replace(/^autoclipper\//, '');
}

const iconButton =
  'flex-shrink-0 cursor-pointer text-[#8a93a3] hover:text-[#bfff00] disabled:cursor-default disabled:opacity-50';

export function DownloadHistory({ onDownload, statuses }: DownloadHistoryProps) {
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    void chrome.runtime
      .sendMessage({ type: 'get-history' })
      .then((h: HistoryEntry[] | undefined) => setHistory(h ?? []));
  }, []);

  const clear = () => {
    void chrome.runtime.sendMessage({ type: 'clear-history' }).then(() => setHistory([]));
  };

  if (!history || history.length === 0) return null;

  return (
    <section className="border-t border-[#23262e] px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[11px] font-bold uppercase tracking-wide text-[#8a93a3]">
          {t('historyTitle')}
        </h2>
        <button
          onClick={clear}
          className="cursor-pointer text-[11px] font-semibold text-[#8a93a3] hover:text-[#ff6b6b]"
        >
          {t('historyClear')}
        </button>
      </div>
      <ul className="space-y-2">
        {history.slice(0, 8).map((entry, i) => {
          const status = entry.url ? statuses[entry.url]?.status : undefined;
          return (
            <li key={`${entry.savedAt}-${i}`} className="flex items-center gap-2 text-xs">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[#c5ccd6]" title={entry.filename}>
                  {entryTitle(entry)}
                </p>
                <p className="text-[10px] text-[#5c6470]">
                  {[providerName(entry.provider), timeAgo(entry.savedAt, now)]
                    .filter(Boolean)
                    .join(' · ')}
                  {status === 'interrupted' && (
                    <span className="text-[#ff6b6b]"> · {t('downloadError')}</span>
                  )}
                </p>
              </div>
              {entry.url && (
                <button
                  onClick={() =>
                    onDownload(entry.url!, entry.filename, {
                      provider: entry.provider,
                      title: entry.title,
                      pageUrl: entry.pageUrl,
                      audioUrl: entry.audioUrl,
                    })
                  }
                  disabled={status === 'downloading'}
                  title={t('redownload')}
                  aria-label={t('redownload')}
                  className={iconButton}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className={`h-3.5 w-3.5 ${status === 'downloading' ? 'animate-spin' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.2L3 16M3 21v-5h5" />
                  </svg>
                </button>
              )}
              {entry.downloadId !== undefined && entry.fileExists !== false && (
                <button
                  onClick={() =>
                    chrome.runtime.sendMessage({
                      type: 'show-download',
                      downloadId: entry.downloadId,
                    })
                  }
                  title={t('openFile')}
                  aria-label={t('openFile')}
                  className={iconButton}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                  >
                    <path
                      d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
                      strokeWidth="2"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
