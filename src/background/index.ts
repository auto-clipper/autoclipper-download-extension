import type { BackgroundMessage, MediaItem } from '@/shared/types';

/**
 * MV3 service worker. Keeps the per-tab list of detected media in
 * chrome.storage.session (the worker itself is ephemeral) and performs
 * downloads via chrome.downloads — browser downloads carry the user's
 * cookies, which signed CDN URLs (TikTok especially) often require.
 */

const keyFor = (tabId: number) => `media:${tabId}`;

async function getMedia(tabId: number): Promise<MediaItem[]> {
  const stored = await chrome.storage.session.get(keyFor(tabId));
  return (stored[keyFor(tabId)] as MediaItem[] | undefined) ?? [];
}

async function setMedia(tabId: number, items: MediaItem[]): Promise<void> {
  await chrome.storage.session.set({ [keyFor(tabId)]: items });
  await chrome.action.setBadgeText({ tabId, text: items.length ? String(items.length) : '' });
  await chrome.action.setBadgeBackgroundColor({ tabId, color: '#BFFF00' });
}

chrome.runtime.onMessage.addListener((message: BackgroundMessage, sender, sendResponse) => {
  switch (message.type) {
    case 'media-found': {
      const tabId = sender.tab?.id;
      if (tabId !== undefined) {
        void setMedia(tabId, message.items);
      }
      break;
    }
    case 'get-media': {
      const tabId = message.tabId ?? sender.tab?.id;
      if (tabId === undefined) {
        sendResponse([]);
        break;
      }
      void getMedia(tabId).then(sendResponse);
      return true; // async response
    }
    case 'auth-state': {
      void chrome.storage.local.set({ acAuth: message.user });
      break;
    }
    case 'download': {
      const tabId = sender.tab?.id;
      chrome.downloads
        .download({ url: message.url, filename: message.filename, saveAs: false })
        .then(async (downloadId) => {
          // Survive service-worker restarts during long downloads.
          await chrome.storage.session.set({
            [`dl:${downloadId}`]: { url: message.url, tabId },
          });
          sendResponse({ ok: true });
          // The download may already have finished while the record was
          // being written — onChanged would have found nothing to notify.
          const [item] = await chrome.downloads.search({ id: downloadId });
          if (item && (item.state === 'complete' || item.state === 'interrupted')) {
            await notifyDownloadStatus(downloadId, item.state);
          }
        })
        .catch((error) => sendResponse({ ok: false, error: String(error) }));
      return true; // async response
    }
  }
  return undefined;
});

async function notifyDownloadStatus(
  downloadId: number,
  status: 'complete' | 'interrupted',
): Promise<void> {
  const key = `dl:${downloadId}`;
  const stored = await chrome.storage.session.get(key);
  const entry = stored[key] as { url: string; tabId?: number } | undefined;
  if (!entry) return;
  await chrome.storage.session.remove(key);
  const message = { type: 'download-status', url: entry.url, status };
  if (entry.tabId !== undefined) {
    chrome.tabs.sendMessage(entry.tabId, message).catch(() => {});
  }
  // Also reaches the popup, if open.
  chrome.runtime.sendMessage(message).catch(() => {});
}

chrome.downloads.onChanged.addListener((delta) => {
  const state = delta.state?.current;
  if (state !== 'complete' && state !== 'interrupted') return;
  void notifyDownloadStatus(delta.id, state);
});

// A tab navigating away invalidates its detected media.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading' && changeInfo.url) {
    void setMedia(tabId, []);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void chrome.storage.session.remove(keyFor(tabId));
});
