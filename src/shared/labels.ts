import type { ProviderId } from './types';

/** Human-facing platform names (the ids are internal, e.g. "twitter"). */
const PROVIDER_NAMES: Record<ProviderId, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  twitter: 'X',
  reddit: 'Reddit',
  twitch: 'Twitch',
  youtube: 'YouTube',
};

export function providerName(provider: string | undefined): string {
  return PROVIDER_NAMES[provider as ProviderId] ?? provider ?? '';
}

/**
 * One quality format everywhere: "720p", the short side of the frame, so a
 * vertical 720x1280 reel and a horizontal 1280x720 clip both read "720p".
 */
export function qualityFromSize(width?: number, height?: number): string | undefined {
  if (!width || !height) return undefined;
  return `${Math.min(width, height)}p`;
}

/** Parse "…/720x1280/…" style dimensions out of a CDN URL. */
export function qualityFromUrl(url: string): string | undefined {
  const match = /\/(\d{2,5})x(\d{2,5})\//.exec(url);
  return match ? qualityFromSize(Number(match[1]), Number(match[2])) : undefined;
}

/**
 * i18n key explaining a failed download, from a chrome.downloads
 * InterruptReason (or an error string from downloads.download()).
 * Signed CDN links expire, so server/network errors mostly mean "refresh".
 */
export function failureReasonKey(error?: string): string {
  if (!error) return 'errorGeneric';
  if (/^(SERVER_|NETWORK_)/.test(error)) return 'errorLinkExpired';
  if (/^FILE_/.test(error)) return 'errorFile';
  return 'errorGeneric';
}
