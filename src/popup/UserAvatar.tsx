import { useState } from 'react';
import type { AuthUser } from '@/shared/types';

/** The user's AutoClipper avatar, or their initial when there is none (or it fails to load). */
export function UserAvatar({ user }: { user: AuthUser }) {
  const [failed, setFailed] = useState(false);
  const base = 'h-6 w-6 flex-shrink-0 rounded-full';
  if (user.avatarUrl && !failed) {
    return (
      <img
        src={user.avatarUrl}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`${base} bg-[#1a1d24] object-cover`}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`${base} inline-flex items-center justify-center bg-gradient-to-br from-[#bfff00] to-[#00e5ff] text-[11px] font-bold text-[#0b0d11]`}
    >
      {(user.username ?? user.email ?? '?').charAt(0).toUpperCase()}
    </span>
  );
}
