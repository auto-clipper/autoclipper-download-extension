export type ProviderId = 'instagram' | 'tiktok' | 'twitter' | 'reddit' | 'twitch' | 'youtube';

export interface MediaVariant {
  url: string;
  quality?: string;
}

export interface MediaItem {
  /** Stable id used for de-duplication (provider + media id or URL hash). */
  id: string;
  provider: ProviderId;
  /** Direct URL of the video file (or best-effort playback URL). */
  url: string;
  /** Reddit serves audio as a separate DASH track. */
  audioUrl?: string;
  pageUrl: string;
  title?: string;
  thumbnail?: string;
  quality?: string;
  /** Alternative renditions, best first (drives the quality picker). */
  variants?: MediaVariant[];
  /** Suggested download filename (sanitized, with extension). */
  filename: string;
}

export type DownloadStatus = 'downloading' | 'complete' | 'interrupted';

/** Logged-in AutoClipper user, as observed on app.autoclipper.live. */
export interface AuthUser {
  username?: string | null;
  email?: string | null;
}

export interface DownloadMeta {
  provider?: string;
  title?: string;
  pageUrl?: string;
  /** When set, fetch url + audioUrl and mux into one MP4 before saving. */
  audioUrl?: string;
}

export interface HistoryEntry {
  filename: string;
  provider?: string;
  title?: string;
  pageUrl?: string;
  /** Epoch ms; supplied by the caller (service workers lack a stable clock). */
  savedAt: number;
  downloadId?: number;
}

export type BackgroundMessage =
  | { type: 'media-found'; items: MediaItem[] }
  | { type: 'get-media'; tabId?: number }
  | { type: 'download'; url: string; filename: string; now: number; meta?: DownloadMeta }
  | { type: 'show-download'; downloadId: number }
  | { type: 'get-history' }
  | { type: 'clear-history' }
  | { type: 'download-status'; url: string; status: DownloadStatus }
  | { type: 'auth-state'; user: AuthUser | null }
  | { type: 'clear-media' };

export interface DownloadResponse {
  ok: boolean;
  error?: string;
}

export interface InterceptorPayload {
  source: 'autoclipper-dl';
  kind: 'json-response';
  url: string;
  body: string;
}
