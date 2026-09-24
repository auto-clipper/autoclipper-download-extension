import type { DownloadMeta, DownloadStatus, MediaItem } from '@/shared/types';
import { failureReasonKey } from '@/shared/labels';
import { canSendToApp } from '@/shared/constants';
import { itemForLocation, matchItem } from './match';

/**
 * Inline "Download" buttons drawn on top of each video player on the page,
 * shown while the pointer hovers the player (and while a download it started
 * is in flight). Complements the floating panel: same items, same download
 * path, one click where the video is.
 *
 * The buttons live in their own fixed-position layer (closed shadow root)
 * instead of inside the site's player markup — site players clip overflow,
 * swallow pointer events and get re-rendered by their frameworks, so we
 * track each player's bounding box and float the button over it.
 */

interface InlineOptions {
  onDownload: (url: string, filename: string, meta?: DownloadMeta) => void;
  sendUrl: (pageUrl: string) => string;
  /** Items paired with a player on screen, most prominent first (drives list order). */
  onVisibleItems?: (ids: string[]) => void;
}

export interface InlineButtons {
  setItems(items: MediaItem[]): void;
  setStatus(url: string, status: DownloadStatus, error?: string): void;
  resetIfDownloading(url: string): void;
  /** Show/hide the hover pills. Pairing keeps running (menu + shortcut use it). */
  setEnabled(enabled: boolean): void;
  /**
   * The item a download gesture refers to: the player under `point` (or
   * under the pointer), else the most prominent player on screen.
   */
  targetItem(point?: { x: number; y: number }): MediaItem | undefined;
}

/** Reddit's shreddit players keep their <video> in a shadow root; anchor on the host. */
const PLAYER_SELECTOR = 'video, shreddit-player, shreddit-player-2';
const MIN_WIDTH = 160;
const MIN_HEIGHT = 120;
/** How far up the tree we look for the post a player belongs to. */
const MAX_DEPTH = 12;
const MAX_LINKS_PER_LEVEL = 80;
/** Sibling overlays (gesture layers, captions) sit within this many ancestors. */
const OCCLUSION_ANCESTORS = 4;
const SCAN_INTERVAL_MS = 1000;

const t = (key: string, subs?: string[]) => chrome.i18n.getMessage(key, subs) || key;

const STYLES = `
  :host { all: initial; }
  .layer {
    position: fixed; inset: 0; z-index: 2147483645; pointer-events: none;
    font-family: system-ui, -apple-system, sans-serif;
  }
  .pill {
    position: absolute; top: 0; left: 0; display: none; gap: 4px;
    pointer-events: auto; will-change: transform;
  }
  .pill.visible { display: flex; }
  button, a {
    all: unset; box-sizing: border-box; cursor: pointer; height: 32px;
    display: inline-flex; align-items: center; gap: 6px; border-radius: 10px;
    font-size: 13px; font-weight: 700; line-height: 1;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
    transition: filter 0.12s ease, transform 0.12s ease;
  }
  button:hover, a:hover { filter: brightness(1.08); transform: translateY(-1px); }
  .dl { padding: 0 12px 0 10px; background: #bfff00; color: #0b0d11; }
  .dl:disabled { cursor: default; transform: none; }
  .dl.done { background: #0b0d11; color: #bfff00; border: 1px solid #bfff00; }
  .dl.failed { background: #2e2326; color: #ff6b6b; }
  .send {
    width: 32px; justify-content: center; background: rgba(11, 13, 17, 0.82);
    color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.45);
  }
  svg { width: 16px; height: 16px; flex-shrink: 0; }
  .spinner {
    width: 12px; height: 12px; border-radius: 50%;
    border: 2px solid rgba(11, 13, 17, 0.3); border-top-color: #0b0d11;
    animation: acdl-spin 0.7s linear infinite;
  }
  @keyframes acdl-spin { to { transform: rotate(360deg); } }
`;

const DOWNLOAD_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5"/><path d="M5 20h14"/></svg>`;
const SCISSORS_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.12 15.88M14.47 14.48L20 20M8.12 8.12L12 12"/></svg>`;

interface Entry {
  item: MediaItem;
  pill: HTMLDivElement;
  dl: HTMLButtonElement;
}

function isVisibleRect(rect: DOMRect): boolean {
  return (
    rect.width >= MIN_WIDTH &&
    rect.height >= MIN_HEIGHT &&
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < window.innerHeight &&
    rect.left < window.innerWidth
  );
}

/** Strings describing a player and its surroundings, nearest first (see match.ts). */
function contextLevels(player: Element): string[][] {
  const levels: string[][] = [];
  const own: string[] = [player.id];
  if (player instanceof HTMLVideoElement) {
    own.push(player.poster);
    for (const src of [player.currentSrc, player.src]) {
      if (src && !src.startsWith('blob:')) own.push(src);
    }
  }
  levels.push(own);

  const seenLinks = new Set<string>();
  let el = player.parentElement;
  for (let depth = 0; el && el !== document.body && depth < MAX_DEPTH; depth++) {
    // Stop once the ancestor holds other players: from here on, links
    // belong to neighbouring posts as much as to ours.
    if (el.querySelectorAll(PLAYER_SELECTOR).length > 1) break;
    const level = [el.id, el.getAttribute('permalink') ?? '', el.getAttribute('href') ?? ''];
    let added = 0;
    for (const link of el.querySelectorAll<HTMLAnchorElement>('a[href]')) {
      if (added >= MAX_LINKS_PER_LEVEL) break;
      if (seenLinks.has(link.href)) continue;
      seenLinks.add(link.href);
      level.push(link.href);
      added++;
    }
    levels.push(level);
    el = el.parentElement;
  }
  return levels;
}

/** False when a modal/overlay from the page covers the player's centre. */
function isUncovered(player: Element, rect: DOMRect, host: Element): boolean {
  const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
  if (!hit) return false;
  if (hit === host || player.contains(hit) || hit.contains(player)) return true;
  // Never widen the scope to <body>: page-level modals are its children too.
  let scope: Element = player;
  for (let i = 0; i < OCCLUSION_ANCESTORS; i++) {
    const parent = scope.parentElement;
    if (!parent || parent === document.body || parent === document.documentElement) break;
    scope = parent;
  }
  return scope.contains(hit);
}

export function createInlineButtons(options: InlineOptions): InlineButtons {
  const host = document.createElement('div');
  host.id = 'autoclipper-dl-inline';
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = STYLES;
  const layer = document.createElement('div');
  layer.className = 'layer';
  shadow.append(style, layer);

  let items: MediaItem[] = [];
  let enabled = true;
  const statuses = new Map<string, DownloadStatus>();
  const errors = new Map<string, string>();
  const entries = new Map<Element, Entry>();
  let pointer: { x: number; y: number } | null = null;
  let lastVisible = '';
  /** Paired items on screen, most prominent first (see reportVisible). */
  let visibleItems: MediaItem[] = [];
  let frame = 0;

  const attach = () => {
    if (document.body && !host.isConnected) document.body.appendChild(host);
  };

  function applyStatus(entry: Entry): void {
    const { dl, item } = entry;
    const status = statuses.get(item.url);
    dl.disabled = status === 'downloading';
    dl.classList.toggle('done', status === 'complete');
    dl.classList.toggle('failed', status === 'interrupted');
    const reason = status === 'interrupted' ? errors.get(item.url) : undefined;
    dl.title = reason ? t(reason) : [t('downloadVideo'), item.quality].filter(Boolean).join(' · ');
    const label = document.createElement('span');
    if (status === 'downloading') {
      label.textContent = t('downloading');
      dl.replaceChildren(
        Object.assign(document.createElement('span'), { className: 'spinner' }),
        label,
      );
      return;
    }
    label.textContent =
      status === 'complete'
        ? t('saved')
        : status === 'interrupted'
          ? t('downloadError')
          : t('inlineDownload');
    dl.innerHTML = status ? '' : DOWNLOAD_ICON;
    dl.appendChild(label);
  }

  function createEntry(item: MediaItem): Entry {
    const pill = document.createElement('div');
    pill.className = 'pill';

    const dl = document.createElement('button');
    dl.className = 'dl';

    const send = document.createElement('a');
    send.className = 'send';
    send.target = '_blank';
    send.rel = 'noopener';
    send.title = t('sendToAutoclipperShort');
    send.setAttribute('aria-label', t('sendToAutoclipperShort'));
    send.innerHTML = SCISSORS_ICON;

    // Keep our clicks away from the site's player handlers (play/pause,
    // open-post navigation) listening further up the document.
    for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click', 'dblclick']) {
      pill.addEventListener(type, (event) => event.stopPropagation());
    }

    const entry: Entry = { item, pill, dl };
    dl.addEventListener('click', () => {
      const current = entry.item;
      options.onDownload(current.url, current.filename, {
        provider: current.provider,
        title: current.title,
        pageUrl: current.pageUrl,
        audioUrl: current.audioUrl,
      });
    });
    send.addEventListener('click', () => {
      send.href = options.sendUrl(entry.item.pageUrl);
    });
    send.href = options.sendUrl(item.pageUrl);

    pill.append(dl);
    // The app can't import TikTok/X/Reddit links; no Send button there.
    if (canSendToApp(item.provider)) pill.append(send);
    layer.appendChild(pill);
    applyStatus(entry);
    return entry;
  }

  function reportVisible(paired: Map<Element, MediaItem>): void {
    // Most prominent first: nearest to the viewport centre.
    const centre = window.innerHeight / 2;
    const distance = (el: Element) => {
      const r = el.getBoundingClientRect();
      return Math.abs(r.top + r.height / 2 - centre);
    };
    visibleItems = [...paired]
      .sort(([a], [b]) => distance(a) - distance(b))
      .map(([, item]) => item);
    const ids = visibleItems.map((item) => item.id);
    const key = ids.join('|');
    if (key === lastVisible) return;
    lastVisible = key;
    options.onVisibleItems?.(ids);
  }

  /** Re-pair players with items; runs on a slow interval (DOM walk is not free). */
  function scan(): void {
    if (!items.length) {
      for (const entry of entries.values()) entry.pill.remove();
      entries.clear();
      return;
    }
    attach();

    const players = [...document.querySelectorAll(PLAYER_SELECTOR)].filter((player) =>
      isVisibleRect(player.getBoundingClientRect()),
    );
    const paired = new Map<Element, MediaItem>();
    for (const player of players) {
      const item = matchItem(contextLevels(player), items);
      if (item) paired.set(player, item);
    }

    // Single-video pages (reel, TikTok /video/, clip): the URL names the item;
    // give it to the most prominent unpaired player.
    const unpaired = players.filter((player) => !paired.has(player));
    const pagedItem = itemForLocation(window.location.href, items);
    const pairedItems = new Set(paired.values());
    const fallback =
      pagedItem && !pairedItems.has(pagedItem)
        ? pagedItem
        : items.length === 1 && paired.size === 0
          ? items[0]
          : undefined;
    if (fallback && unpaired.length) {
      const area = (el: Element) => {
        const r = el.getBoundingClientRect();
        return r.width * r.height;
      };
      const biggest = unpaired.reduce((a, b) => (area(b) > area(a) ? b : a));
      paired.set(biggest, fallback);
    }

    for (const [player, entry] of entries) {
      if (paired.get(player) !== entry.item) {
        entry.pill.remove();
        entries.delete(player);
      }
    }
    for (const [player, item] of paired) {
      if (!entries.has(player)) entries.set(player, createEntry(item));
    }
    reportVisible(paired);
    schedule();
  }

  /** Position pills over their players; loops per frame while any is shown. */
  function position(): void {
    frame = 0;
    let anyVisible = false;
    for (const [player, entry] of entries) {
      const rect = player.getBoundingClientRect();
      const hovered =
        pointer !== null &&
        pointer.x >= rect.left &&
        pointer.x <= rect.right &&
        pointer.y >= rect.top &&
        pointer.y <= rect.bottom;
      const busy = statuses.has(entry.item.url);
      const show =
        enabled &&
        player.isConnected &&
        !document.fullscreenElement &&
        (hovered || busy) &&
        isVisibleRect(rect) &&
        isUncovered(player, rect, host);
      entry.pill.classList.toggle('visible', show);
      if (show) {
        anyVisible = true;
        const x = Math.max(rect.left, 0) + 10;
        const y = Math.max(rect.top, 0) + 10;
        entry.pill.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      }
    }
    // Players move without scroll events (feed snapping, layout shifts);
    // keep tracking while something is on screen.
    if (anyVisible) schedule();
  }

  function schedule(): void {
    if (!frame) frame = requestAnimationFrame(position);
  }

  window.addEventListener(
    'pointermove',
    (event) => {
      pointer = { x: event.clientX, y: event.clientY };
      schedule();
    },
    { capture: true, passive: true },
  );
  document.documentElement.addEventListener('mouseleave', () => {
    pointer = null;
    schedule();
  });
  window.addEventListener('scroll', schedule, { capture: true, passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  setInterval(scan, SCAN_INTERVAL_MS);

  function refreshStatus(url: string): void {
    for (const entry of entries.values()) {
      if (entry.item.url === url) applyStatus(entry);
    }
    schedule();
  }

  return {
    setItems(next: MediaItem[]) {
      items = next;
      scan();
    },
    setStatus(url: string, status: DownloadStatus, error?: string) {
      if (status === 'canceled') {
        statuses.delete(url);
        refreshStatus(url);
        return;
      }
      statuses.set(url, status);
      if (status === 'interrupted') errors.set(url, failureReasonKey(error));
      refreshStatus(url);
      // Leave the "Saved ✓"/"Failed" state up briefly, then go back to hover-only.
      if (status !== 'downloading') {
        setTimeout(() => {
          if (statuses.get(url) === status) {
            statuses.delete(url);
            refreshStatus(url);
          }
        }, 4000);
      }
    },
    resetIfDownloading(url: string) {
      if (statuses.get(url) !== 'downloading') return;
      statuses.delete(url);
      refreshStatus(url);
    },
    setEnabled(next: boolean) {
      enabled = next;
      scan();
    },
    targetItem(point?: { x: number; y: number }) {
      scan();
      const at = point ?? pointer;
      if (at) {
        for (const [player, entry] of entries) {
          const r = player.getBoundingClientRect();
          if (at.x >= r.left && at.x <= r.right && at.y >= r.top && at.y <= r.bottom) {
            return entry.item;
          }
        }
      }
      return visibleItems[0];
    },
  };
}
