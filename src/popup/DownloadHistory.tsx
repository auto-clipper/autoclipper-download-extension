import { useEffect, useState } from 'react';
import type { HistoryEntry } from '@/shared/types';
import { t } from './helpers';

export function DownloadHistory() {
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);

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
      <ul className="space-y-1.5">
        {history.slice(0, 8).map((entry, i) => (
          <li key={`${entry.savedAt}-${i}`} className="flex items-center gap-2 text-xs">
            <span className="truncate text-[#c5ccd6]" title={entry.filename}>
              {entry.title || entry.filename.replace(/^autoclipper\//, '')}
            </span>
            {entry.provider && (
              <span className="ml-auto flex-shrink-0 text-[10px] text-[#5c6470]">
                {entry.provider}
              </span>
            )}
            {entry.downloadId !== undefined && (
              <button
                onClick={() =>
                  chrome.runtime.sendMessage({
                    type: 'show-download',
                    downloadId: entry.downloadId,
                  })
                }
                title={t('openFile')}
                className="flex-shrink-0 cursor-pointer text-[#8a93a3] hover:text-[#bfff00]"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor">
                  <path
                    d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
