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

const MAX_BODY_CHARS = 8 * 1024 * 1024;
const MAX_PENDING_RESPONSES = 24;
const pending: InterceptorPayload[] = [];
let pendingChars = 0;
let receiverReady = false;

// The isolated-world script loads after the page starts its first requests.
// Hold matching responses until it has attached its message listener.
function onReceiverReady(event: MessageEvent): void {
  if (
    event.source !== window ||
    event.origin !== window.location.origin ||
    event.data?.source !== 'autoclipper-dl' ||
    event.data.kind !== 'receiver-ready'
  ) {
    return;
  }

  receiverReady = true;
  window.removeEventListener('message', onReceiverReady);
  for (const payload of pending) window.postMessage(payload, window.location.origin);
  pending.length = 0;
  pendingChars = 0;
}
window.addEventListener('message', onReceiverReady);

function relay(url: string, body: string): void {
  if (!body || body.length > MAX_BODY_CHARS) return;
  if (!BODY_MARKERS.some((m) => body.includes(m))) return;
  const payload: InterceptorPayload = {
    source: 'autoclipper-dl',
    kind: 'json-response',
    url,
    body,
  };
  if (receiverReady) {
    window.postMessage(payload, window.location.origin);
    return;
  }

  pending.push(payload);
  pendingChars += body.length;
  while (pending.length > MAX_PENDING_RESPONSES || pendingChars > MAX_BODY_CHARS) {
    pendingChars -= pending.shift()!.body.length;
  }
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
  this.addEventListener(
    'load',
    () => {
      try {
        if (this.responseType === '' || this.responseType === 'text') {
          relay(url, this.responseText);
        } else if (this.responseType === 'json' && this.response) {
          relay(url, JSON.stringify(this.response));
        }
      } catch {
        // Observation must never break the page.
      }
    },
    { once: true },
  );
  return (originalOpen as any).apply(this, args);
};
