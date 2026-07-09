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
    case 'download': {
      void chrome.downloads.download({
        url: message.url,
        filename: message.filename,
        saveAs: false,
      });
      break;
    }
  }
  return undefined;
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
