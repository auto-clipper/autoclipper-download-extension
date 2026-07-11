import type { InterceptorPayload } from '@/shared/types';

/**
 * Runs in the page's MAIN world (declared in the manifest) on Instagram,
 * TikTok and X. Wraps fetch/XHR to observe JSON API responses that carry
 * direct video URLs, and relays candidate bodies to the isolated-world
 * content script via window.postMessage. It never modifies requests or
 * responses.
 */

/** Cheap pre-filter so we only ship bodies that can contain video descriptors. */
const BODY_MARKERS = [
  'video_versions',
  'video_url',
  'playAddr',
  'downloadAddr',
  'video_info',
  'videoQualities',
];

const MAX_BODY_BYTES = 8 * 1024 * 1024;

function relay(url: string, body: string): void {
  if (!body || body.length > MAX_BODY_BYTES) return;
  if (!BODY_MARKERS.some((m) => body.includes(m))) return;
  const payload: InterceptorPayload = {
    source: 'autoclipper-dl',
    kind: 'json-response',
    url,
    body,
  };
  window.postMessage(payload, window.location.origin);
}

// --- fetch ---
const originalFetch = window.fetch;
window.fetch = async function (...args: Parameters<typeof fetch>) {
  const response = await originalFetch.apply(this, args);
  try {
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('json') || contentType.includes('text')) {
      response
        .clone()
        .text()
        .then((body) => relay(response.url, body))
        .catch(() => {});
    }
  } catch {
    // Observation must never break the page.
  }
  return response;
};

// --- XMLHttpRequest ---
const originalOpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function (...args: any[]) {
  const url = String(args[1] ?? '');
  this.addEventListener('load', () => {
    try {
      if (this.responseType === '' || this.responseType === 'text') {
        relay(url, this.responseText);
      }
    } catch {
      // ignore
    }
  });
  return (originalOpen as any).apply(this, args);
};
