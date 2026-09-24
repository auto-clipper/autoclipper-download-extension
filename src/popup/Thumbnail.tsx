import { useState } from 'react';
import type { MediaItem } from '@/shared/types';
import { providerName } from '@/shared/labels';

/** Thumbnail, or a platform-initials tile when there is none or it fails to load. */
export function Thumbnail({ item }: { item: MediaItem }) {
  const [failed, setFailed] = useState(false);
  const base = 'h-12 w-12 flex-shrink-0 rounded-lg bg-[#1a1d24]';
  if (!item.thumbnail || failed) {
    return (
      <span
        aria-hidden
        className={`${base} flex items-center justify-center text-[11px] font-bold text-[#5c6470]`}
      >
        {providerName(item.provider).slice(0, 2)}
      </span>
    );
  }
  return (
    <img
      src={item.thumbnail}
      alt=""
      onError={() => setFailed(true)}
      className={`${base} object-cover`}
    />
  );
}
