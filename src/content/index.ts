import type { InterceptorPayload, MediaItem } from '@/shared/types';
import { providerForHost } from '@/providers/registry';
import { extractTikTokFromRehydration } from '@/providers/tiktok';
import { createPanel } from './panel';

const host = window.location.hostname;
const isYouTube = host.endsWith('youtube.com');
const provider = providerForHost(host);

const items = new Map<string, MediaItem>();
const panel = createPanel({
  mode: isYouTube ? 'youtube' : 'download',
  onDownload: (url, filename) => {
    void chrome.runtime.sendMessage({ type: 'download', url, filename });
  },
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

function onNavigate(): void {
  if (provider?.id === 'reddit') void scanRedditPost();
  if (provider?.id === 'tiktok') scanTikTokRehydration();
  if (isYouTube) panel.setYouTubeUrl(window.location.href);
}

// SPA navigation: these sites rewrite history instead of reloading.
let lastHref = window.location.href;
setInterval(() => {
  if (window.location.href !== lastHref) {
    lastHref = window.location.href;
    onNavigate();
  }
}, 1500);

onNavigate();
