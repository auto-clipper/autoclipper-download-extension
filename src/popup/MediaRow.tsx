import { useState } from 'react';
import type { DownloadMeta, DownloadStatus, MediaItem } from '@/shared/types';
import { failureReasonKey, providerName } from '@/shared/labels';
import { t, sendToAppUrl } from './helpers';
import { Thumbnail } from './Thumbnail';

export interface StatusEntry {
  status: DownloadStatus;
  error?: string;
}

interface MediaRowProps {
  item: MediaItem;
  /** Keyed by download URL — each quality variant has its own entry. */
  statuses: Record<string, StatusEntry>;
  onDownload: (url: string, filename: string, meta: DownloadMeta) => void;
}

function label(status: DownloadStatus | undefined, idle: string) {
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
}

export function MediaRow({ item, statuses, onDownload }: MediaRowProps) {
  const variants = item.variants?.filter((v) => v.url) ?? [];
  const [selectedUrl, setSelectedUrl] = useState(item.url);
  const status = statuses[selectedUrl]?.status;
  const audioStatus = item.audioUrl ? statuses[item.audioUrl]?.status : undefined;
  const failure = [selectedUrl, item.audioUrl]
    .map((url) => (url ? statuses[url] : undefined))
    .find((entry) => entry?.status === 'interrupted');

  const meta: DownloadMeta = {
    provider: item.provider,
    title: item.title,
    pageUrl: item.pageUrl,
    audioUrl: item.audioUrl,
  };

  return (
    <li className="flex gap-3 px-4 py-3">
      <Thumbnail item={item} />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-xs leading-snug">{item.title || item.pageUrl}</p>
        <p className="mt-0.5 text-[11px] text-[#8a93a3]">
          {[providerName(item.provider), item.quality].filter(Boolean).join(' · ')}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => onDownload(selectedUrl, item.filename, meta)}
            disabled={status === 'downloading'}
            className="cursor-pointer rounded-lg bg-[#bfff00] px-3 py-1.5 text-xs font-bold text-[#0b0d11] hover:brightness-110 disabled:cursor-default disabled:opacity-75"
          >
            {label(status, t('downloadVideo'))}
          </button>

          {variants.length > 1 && (
            <select
              value={selectedUrl}
              onChange={(e) => setSelectedUrl(e.target.value)}
              aria-label={t('qualityLabel')}
              className="cursor-pointer rounded-lg border border-[#23262e] bg-[#1a1d24] px-2 py-1.5 text-xs font-semibold text-[#f4f7fb]"
            >
              {variants.map((v) => (
                <option key={v.url} value={v.url}>
                  {v.quality ?? t('downloadVideo')}
                </option>
              ))}
            </select>
          )}

          {item.audioUrl && (
            <button
              onClick={() =>
                onDownload(item.audioUrl!, item.filename.replace(/\.mp4$/, '-audio.mp4'), {
                  provider: item.provider,
                  title: item.title,
                  pageUrl: item.pageUrl,
                })
              }
              disabled={audioStatus === 'downloading'}
              className="cursor-pointer rounded-lg bg-[#23262e] px-3 py-1.5 text-xs font-bold hover:brightness-125 disabled:cursor-default disabled:opacity-75"
            >
              {label(audioStatus, t('downloadAudio'))}
            </button>
          )}

          <a
            href={sendToAppUrl(item.pageUrl, 'popup-item-send')}
            target="_blank"
            rel="noopener"
            className="rounded-lg border border-[#00e5ff]/40 px-3 py-1.5 text-xs font-bold text-[#00e5ff] no-underline hover:bg-[#00e5ff]/10"
          >
            {t('sendToAutoclipperShort')}
          </a>
        </div>
        {failure && (
          <p className="mt-1.5 text-[11px] leading-snug text-[#ff6b6b]">
            {t(failureReasonKey(failure.error))}
          </p>
        )}
      </div>
    </li>
  );
}
