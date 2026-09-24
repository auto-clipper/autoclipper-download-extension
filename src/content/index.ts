import type {
  BackgroundMessage,
  DownloadMeta,
  DownloadResponse,
  DownloadStatus,
  InterceptorPayload,
  MediaItem,
} from '@/shared/types';
import { providerForHost } from '@/providers/registry';
import { extractFromPackagedMedia } from '@/providers/reddit';
import { extractTikTokFromRehydration } from '@/providers/tiktok';
import { createInlineButtons } from './inline';
import { orderItems } from './match';
import { APP_SEND_URL, createPanel } from './panel';
import { INLINE_BUTTONS_KEY } from '@/shared/constants';

const host = window.location.hostname;
const isYouTube = host.endsWith('youtube.com');
const provider = providerForHost(host);

/** Detected media in detection order (oldest first); see orderItems() for display order. */
const items = new Map<string, MediaItem>();
let visibleIds: string[] = [];

/**
 * Reloading/updating the extension orphans the content scripts of already
 * open tabs: the panel still renders, but every chrome.runtime call throws
 * "Extension context invalidated". Detect that and say so, instead of
 * showing a misleading download failure.
 */
function isStaleContext(error: unknown): boolean {
  return String(error).includes('Extension context invalidated');
}

function setStatus(url: string, status: DownloadStatus, error?: string): void {
  panel.setStatus(url, status, error);
  inline?.setStatus(url, status, error);
}

function resetIfDownloading(url: string): void {
  panel.resetIfDownloading(url);
  inline?.resetIfDownloading(url);
}

function download(url: string, filename: string, meta?: DownloadMeta): void {
  setStatus(url, 'downloading');
  try {
    chrome.runtime
      .sendMessage({ type: 'download', url, filename, now: Date.now(), meta })
      .then((response: DownloadResponse | undefined) => {
        // Only an explicit rejection means the download failed to start.
        // An undefined response is a messaging anomaly — the download is
        // usually running; let download-status events settle the outcome,
        // but fall back to idle so the button never hangs on the spinner.
        if (response && !response.ok) {
          setStatus(url, 'interrupted');
        } else if (!response) {
          setTimeout(() => resetIfDownloading(url), 20_000);
        }
      })
      .catch((error) => {
        if (isStaleContext(error)) panel.showStaleNotice();
        else setTimeout(() => resetIfDownloading(url), 20_000);
      });
  } catch (error) {
    if (isStaleContext(error)) panel.showStaleNotice();
    else setStatus(url, 'interrupted');
  }
}

const panel = createPanel({ mode: isYouTube ? 'youtube' : 'download', onDownload: download });

// On-video download buttons (not on YouTube: CTA only, never downloads).
const inline = isYouTube
  ? null
  : createInlineButtons({
      onDownload: download,
      sendUrl: (pageUrl) => APP_SEND_URL(pageUrl, 'inline-send'),
      onVisibleItems: (ids) => {
        visibleIds = ids;
        publish();
      },
    });

// Users can turn the on-video buttons off from the popup.
if (inline) {
  void chrome.storage.local.get(INLINE_BUTTONS_KEY).then((stored) => {
    inline.setEnabled(stored[INLINE_BUTTONS_KEY] !== false);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && INLINE_BUTTONS_KEY in changes) {
      inline.setEnabled(changes[INLINE_BUTTONS_KEY].newValue !== false);
    }
  });
}

chrome.runtime.onMessage.addListener((message: BackgroundMessage) => {
  if (message.type === 'download-status') {
    setStatus(message.url, message.status, message.error);
  }
});

function addItems(found: MediaItem[]): void {
  let changed = false;
  for (const item of found) {
    if (!items.has(item.id)) {
      items.set(item.id, item);
      changed = true;
    }
  }
  if (!changed) return;
  const ordered = publish();
  // Forget what fell off the list so the map stays bounded on endless feeds.
  const kept = new Set(ordered.map((item) => item.id));
  for (const id of items.keys()) if (!kept.has(id)) items.delete(id);
  inline?.setItems(ordered);
}

/** Push the current order (on-screen first, then newest) to the panel and popup. */
function publish(): MediaItem[] {
  const ordered = orderItems([...items.values()], visibleIds);
  panel.setItems(ordered);
  void chrome.runtime.sendMessage({ type: 'media-found', items: ordered }).catch(() => {});
  return ordered;
}

// --- Interceptor relay (Instagram, TikTok, X) ---
window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window) return;
  const data = event.data as InterceptorPayload;
  if (data?.source !== 'autoclipper-dl' || data.kind !== 'json-response') return;
  if (!provider) return;
  addItems(provider.extractFromJson(data.body, window.location.href));
});

// --- TikTok SSR state (first video is server-rendered, no XHR to observe) ---
function scanTikTokRehydration(): void {
  const script = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');
  if (script?.textContent) {
    addItems(extractTikTokFromRehydration(script.textContent, window.location.href));
  }
}

// --- Reddit: the post's public JSON carries the reddit_video descriptor ---
const POST_PATH = /^\/r\/[^/]+\/comments\/[^/]+/;
let lastRedditPath = '';

async function scanRedditPost(): Promise<void> {
  const match = POST_PATH.exec(window.location.pathname);
  if (!match || match[0] === lastRedditPath || !provider) return;
  lastRedditPath = match[0];
  try {
    const res = await fetch(`${window.location.origin}${match[0]}.json?raw_json=1`, {
      credentials: 'same-origin',
    });
    if (!res.ok) return;
    addItems(provider.extractFromJson(await res.text(), window.location.href));
  } catch {
    // Post JSON unavailable; the panel simply stays empty.
  }
}

// --- Reddit feeds: shreddit players carry packaged (audio-muxed) MP4s ---
function scanRedditDom(): void {
  const players = document.querySelectorAll(
    'shreddit-player[packaged-media-json], shreddit-player-2[packaged-media-json]',
  );
  const found: MediaItem[] = [];
  for (const player of players) {
    const attr = player.getAttribute('packaged-media-json');
    if (!attr) continue;
    const post = player.closest('shreddit-post');
    const item = extractFromPackagedMedia(attr, {
      title: post?.getAttribute('post-title') ?? undefined,
      permalink: post?.getAttribute('permalink') ?? undefined,
      pageUrl: window.location.href,
    });
    if (item) found.push(item);
  }
  if (found.length) addItems(found);
}

function onNavigate(): void {
  if (provider?.id === 'reddit') void scanRedditPost();
  if (provider?.id === 'tiktok') scanTikTokRehydration();
  if (isYouTube) panel.setYouTubeUrl(window.location.href);
}

// SPA navigation: these sites rewrite history instead of reloading.
// Reddit is also re-scanned every tick — feeds stream in new posts
// continuously while scrolling, with no URL change to key off.
let lastHref = window.location.href;
setInterval(() => {
  if (window.location.href !== lastHref) {
    lastHref = window.location.href;
    onNavigate();
  }
  if (provider?.id === 'reddit') scanRedditDom();
}, 1500);

onNavigate();
if (provider?.id === 'reddit') scanRedditDom();
