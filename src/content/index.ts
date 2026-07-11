import type {
  BackgroundMessage,
  DownloadResponse,
  InterceptorPayload,
  MediaItem,
} from '@/shared/types';
import { providerForHost } from '@/providers/registry';
import { extractFromPackagedMedia } from '@/providers/reddit';
import { extractTikTokFromRehydration } from '@/providers/tiktok';
import { createPanel } from './panel';

const host = window.location.hostname;
const isYouTube = host.endsWith('youtube.com');
const provider = providerForHost(host);

const items = new Map<string, MediaItem>();

/**
 * Reloading/updating the extension orphans the content scripts of already
 * open tabs: the panel still renders, but every chrome.runtime call throws
 * "Extension context invalidated". Detect that and say so, instead of
 * showing a misleading download failure.
 */
function isStaleContext(error: unknown): boolean {
  return String(error).includes('Extension context invalidated');
}

const panel = createPanel({
  mode: isYouTube ? 'youtube' : 'download',
  onDownload: (url, filename, meta) => {
    panel.setStatus(url, 'downloading');
    try {
      chrome.runtime
        .sendMessage({ type: 'download', url, filename, now: Date.now(), meta })
        .then((response: DownloadResponse | undefined) => {
          // Only an explicit rejection means the download failed to start.
          // An undefined response is a messaging anomaly — the download is
          // usually running; let download-status events settle the outcome,
          // but fall back to idle so the button never hangs on the spinner.
          if (response && !response.ok) {
            panel.setStatus(url, 'interrupted');
          } else if (!response) {
            setTimeout(() => panel.resetIfDownloading(url), 20_000);
          }
        })
        .catch((error) => {
          if (isStaleContext(error)) panel.showStaleNotice();
          else setTimeout(() => panel.resetIfDownloading(url), 20_000);
        });
    } catch (error) {
      if (isStaleContext(error)) panel.showStaleNotice();
      else panel.setStatus(url, 'interrupted');
    }
  },
});

chrome.runtime.onMessage.addListener((message: BackgroundMessage) => {
  if (message.type === 'download-status') {
    panel.setStatus(message.url, message.status);
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
  const all = [...items.values()];
  panel.setItems(all);
  void chrome.runtime.sendMessage({ type: 'media-found', items: all });
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
