import { muxVideoAndAudio } from '@/lib/mux';

/**
 * Offscreen document: the MV3 service worker can't create blob URLs, and
 * mp4box wants a browser-ish context. This document fetches Reddit's
 * separate video + audio tracks, muxes them (see @/lib/mux), and returns a
 * blob: URL. The URL lives on the extension origin, so the service worker
 * can hand it to chrome.downloads.download. We keep the blob alive until the
 * worker signals the download finished (revoke-blob), to avoid a race.
 */

interface MuxRequest {
  target: 'offscreen-mux';
  type: 'mux';
  videoUrl: string;
  audioUrl: string;
}

interface RevokeRequest {
  target: 'offscreen-mux';
  type: 'revoke-blob';
  blobUrl: string;
}

const liveBlobs = new Set<string>();

chrome.runtime.onMessage.addListener((message: MuxRequest | RevokeRequest, _sender, sendResponse) => {
  if (message?.target !== 'offscreen-mux') return undefined;

  if (message.type === 'revoke-blob') {
    URL.revokeObjectURL(message.blobUrl);
    liveBlobs.delete(message.blobUrl);
    return undefined;
  }

  if (message.type === 'mux') {
    void (async () => {
      try {
        const [video, audio] = await Promise.all([
          fetchArrayBuffer(message.videoUrl),
          fetchArrayBuffer(message.audioUrl),
        ]);
        const muxed = await muxVideoAndAudio(video, audio);
        const blobUrl = URL.createObjectURL(new Blob([muxed], { type: 'video/mp4' }));
        liveBlobs.add(blobUrl);
        sendResponse({ ok: true, blobUrl });
      } catch (error) {
        sendResponse({ ok: false, error: String(error) });
      }
    })();
    return true; // async response
  }

  return undefined;
});

async function fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url, { credentials: 'omit' });
  if (!res.ok) throw new Error(`fetch ${res.status} for ${url}`);
  return res.arrayBuffer();
}
