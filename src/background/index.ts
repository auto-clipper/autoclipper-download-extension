import type {
  BackgroundMessage,
  DownloadMeta,
  HistoryEntry,
  MediaItem,
} from '@/shared/types';

/**
 * MV3 service worker. Keeps the per-tab list of detected media in
 * chrome.storage.session (the worker itself is ephemeral) and performs
 * downloads via chrome.downloads — browser downloads carry the user's
 * cookies, which signed CDN URLs (TikTok especially) often require.
 */

const keyFor = (tabId: number) => `media:${tabId}`;
const HISTORY_KEY = 'downloadHistory';
const HISTORY_LIMIT = 25;
const OFFSCREEN_PATH = 'src/offscreen/index.html';

// The extension's own GitHub Pages site hosts the install/uninstall pages
// (content we control in this repo); autoclipper.live is the product.
const DOCS_SITE = 'https://auto-clipper.github.io/autoclipper-download-extension';
const UTM = 'utm_source=chrome-extension';

// --- Detected media (per tab) ---

async function getMedia(tabId: number): Promise<MediaItem[]> {
  const stored = await chrome.storage.session.get(keyFor(tabId));
  return (stored[keyFor(tabId)] as MediaItem[] | undefined) ?? [];
}

async function setMedia(tabId: number, items: MediaItem[]): Promise<void> {
  await chrome.storage.session.set({ [keyFor(tabId)]: items });
  await chrome.action.setBadgeText({ tabId, text: items.length ? String(items.length) : '' });
  await chrome.action.setBadgeBackgroundColor({ tabId, color: '#BFFF00' });
}

// --- Download history ---

async function getHistory(): Promise<HistoryEntry[]> {
  const stored = await chrome.storage.local.get(HISTORY_KEY);
  return (stored[HISTORY_KEY] as HistoryEntry[] | undefined) ?? [];
}

async function addHistory(entry: HistoryEntry): Promise<void> {
  const history = await getHistory();
  history.unshift(entry);
  await chrome.storage.local.set({ [HISTORY_KEY]: history.slice(0, HISTORY_LIMIT) });
}

// --- Offscreen muxing (Reddit separate video+audio tracks) ---

let offscreenReady: Promise<void> | null = null;

async function ensureOffscreen(): Promise<void> {
  if (await chrome.offscreen.hasDocument()) return;
  if (!offscreenReady) {
    offscreenReady = chrome.offscreen
      .createDocument({
        url: OFFSCREEN_PATH,
        reasons: [chrome.offscreen.Reason.BLOBS],
        justification: 'Mux Reddit video and audio tracks into one MP4 for download.',
      })
      .catch(() => {
        // A concurrent call may have created it first.
      })
      .finally(() => {
        offscreenReady = null;
      });
  }
  await offscreenReady;
}

async function muxToBlobUrl(videoUrl: string, audioUrl: string): Promise<string> {
  await ensureOffscreen();
  const response = (await chrome.runtime.sendMessage({
    target: 'offscreen-mux',
    type: 'mux',
    videoUrl,
    audioUrl,
  })) as { ok: boolean; blobUrl?: string; error?: string } | undefined;
  if (!response?.ok || !response.blobUrl) {
    throw new Error(response?.error ?? 'mux failed');
  }
  return response.blobUrl;
}

function revokeBlob(blobUrl: string): void {
  chrome.runtime
    .sendMessage({ target: 'offscreen-mux', type: 'revoke-blob', blobUrl })
    .catch(() => {});
}

// --- Download orchestration ---

async function startDownload(
  url: string,
  filename: string,
  now: number,
  meta: DownloadMeta | undefined,
  tabId: number | undefined,
): Promise<number> {
  let downloadUrl = url;
  let blobUrl: string | undefined;

  // Reddit fallback path: fetch + mux video and audio into one file.
  if (meta?.audioUrl) {
    try {
      blobUrl = await muxToBlobUrl(url, meta.audioUrl);
      downloadUrl = blobUrl;
    } catch {
      // Muxing failed — fall back to the video-only track. The panel still
      // offers the separate audio button.
    }
  }

  const downloadId = await chrome.downloads.download({
    url: downloadUrl,
    filename,
    saveAs: false,
  });

  await chrome.storage.session.set({
    [`dl:${downloadId}`]: { url, tabId, blobUrl },
  });
  await addHistory({
    filename,
    provider: meta?.provider,
    title: meta?.title,
    pageUrl: meta?.pageUrl,
    savedAt: now,
    downloadId,
  });

  // The download may already have finished while records were written.
  const [item] = await chrome.downloads.search({ id: downloadId });
  if (item && (item.state === 'complete' || item.state === 'interrupted')) {
    await notifyDownloadStatus(downloadId, item.state);
  }
  return downloadId;
}

async function notifyDownloadStatus(
  downloadId: number,
  status: 'complete' | 'interrupted',
): Promise<void> {
  const key = `dl:${downloadId}`;
  const stored = await chrome.storage.session.get(key);
  const entry = stored[key] as { url: string; tabId?: number; blobUrl?: string } | undefined;
  if (!entry) return;
  await chrome.storage.session.remove(key);
  if (entry.blobUrl) revokeBlob(entry.blobUrl);

  if (status === 'complete') {
    const { dlCount = 0 } = await chrome.storage.local.get('dlCount');
    await chrome.storage.local.set({ dlCount: dlCount + 1 });
  }

  const message = { type: 'download-status', url: entry.url, status };
  if (entry.tabId !== undefined) {
    chrome.tabs.sendMessage(entry.tabId, message).catch(() => {});
  }
  chrome.runtime.sendMessage(message).catch(() => {}); // popup, if open
}

// --- Message router ---

chrome.runtime.onMessage.addListener((message: BackgroundMessage, sender, sendResponse) => {
  switch (message.type) {
    case 'media-found': {
      const tabId = sender.tab?.id;
      if (tabId !== undefined) void setMedia(tabId, message.items);
      break;
    }
    case 'get-media': {
      const tabId = message.tabId ?? sender.tab?.id;
      if (tabId === undefined) {
        sendResponse([]);
        break;
      }
      void getMedia(tabId).then(sendResponse);
      return true;
    }
    case 'auth-state': {
      void chrome.storage.local.set({ acAuth: message.user });
      break;
    }
    case 'get-history': {
      void getHistory().then(sendResponse);
      return true;
    }
    case 'clear-history': {
      void chrome.storage.local.set({ [HISTORY_KEY]: [] }).then(() => sendResponse({ ok: true }));
      return true;
    }
    case 'show-download': {
      chrome.downloads.show(message.downloadId);
      break;
    }
    case 'download': {
      startDownload(message.url, message.filename, message.now, message.meta, sender.tab?.id)
        .then(() => sendResponse({ ok: true }))
        .catch((error) => sendResponse({ ok: false, error: String(error) }));
      return true;
    }
  }
  return undefined;
});

chrome.downloads.onChanged.addListener((delta) => {
  const state = delta.state?.current;
  if (state !== 'complete' && state !== 'interrupted') return;
  void notifyDownloadStatus(delta.id, state);
});

// --- Tab lifecycle ---

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading' && changeInfo.url) {
    void setMedia(tabId, []);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void chrome.storage.session.remove(keyFor(tabId));
});

// --- Install / uninstall funnel ---

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    void chrome.tabs.create({
      url: `${DOCS_SITE}/welcome.html?${UTM}&utm_medium=post-install`,
    });
  }
});

chrome.runtime.setUninstallURL(`${DOCS_SITE}/goodbye.html?${UTM}&utm_medium=uninstall`);
