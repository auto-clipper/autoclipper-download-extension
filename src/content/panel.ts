import type { DownloadMeta, DownloadStatus, MediaItem } from '@/shared/types';
import { failureReasonKey, providerName } from '@/shared/labels';
import { FAB_PREFS_KEY, type FabPref, type FabPrefs } from '@/shared/constants';

interface PanelOptions {
  mode: 'download' | 'youtube';
  /** Key for per-platform floating-button prefs (provider id or "youtube"). */
  siteKey: string;
  onDownload: (url: string, filename: string, meta?: DownloadMeta) => void;
}

const FAB_SIZE = 52;
const FAB_DEFAULT_OFFSET = 24;
const FAB_EDGE_MARGIN = 8;
/** Pointer travel before a press on the button counts as a drag, not a click. */
const DRAG_THRESHOLD = 5;
const PANEL_GAP = 12;
const PANEL_MAX_HEIGHT = 420;
/** Stagger for "Download all" so the queue starts in list order. */
const DOWNLOAD_ALL_STAGGER_MS = 300;

const SCISSORS_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.12 15.88M14.47 14.48L20 20M8.12 8.12L12 12"/></svg>`;
const EYE_OFF_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/></svg>`;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max));

function downloadMetaFor(item: MediaItem): DownloadMeta {
  return {
    provider: item.provider,
    title: item.title,
    pageUrl: item.pageUrl,
    // Reddit fallback path: mux the separate audio track in.
    audioUrl: item.audioUrl,
  };
}

export const APP_SEND_URL = (pageUrl: string, medium = 'panel-send') =>
  `https://app.autoclipper.live/projects?video=${encodeURIComponent(pageUrl)}` +
  `&utm_source=chrome-extension&utm_medium=${medium}`;

interface Panel {
  setItems(items: MediaItem[]): void;
  setYouTubeUrl(url: string): void;
  setStatus(url: string, status: DownloadStatus, error?: string): void;
  /** Revert a button to idle if it is still on the spinner (safety timeout). */
  resetIfDownloading(url: string): void;
  /** Replace the panel body with an "extension updated, refresh page" notice. */
  showStaleNotice(): void;
  /** Open the panel (even when the floating button is hidden on this site). */
  open(): void;
}

const t = (key: string, subs?: string[]) => chrome.i18n.getMessage(key, subs) || key;

function safePathname(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return '';
  }
}

const SITE_URL = 'https://autoclipper.live/?utm_source=chrome-extension&utm_medium=panel';

const STYLES = `
  :host { all: initial; }
  * { box-sizing: border-box; margin: 0; font-family: system-ui, -apple-system, sans-serif; }
  .fab {
    position: fixed; bottom: 24px; right: 24px; z-index: 2147483646;
    width: 52px; height: 52px; border-radius: 16px; border: none; cursor: pointer;
    background: linear-gradient(135deg, #bfff00, #00e5ff);
    display: none; align-items: center; justify-content: center;
    box-shadow: 0 8px 24px rgba(191, 255, 0, 0.35);
    transition: transform 0.15s ease;
  }
  .fab:hover { transform: scale(1.06); }
  .fab.visible { display: flex; }
  .fab.user-hidden { display: none; }
  .fab.dragging { cursor: grabbing; transform: scale(1.06); transition: none; }
  .fab svg { width: 26px; height: 26px; }
  .badge {
    position: absolute; top: -6px; right: -6px; min-width: 20px; height: 20px;
    border-radius: 10px; background: #0b0d11; color: #bfff00;
    font-size: 12px; font-weight: 700; display: flex; align-items: center;
    justify-content: center; padding: 0 5px; border: 1px solid #bfff00;
  }
  .panel {
    position: fixed; bottom: 88px; right: 24px; z-index: 2147483646;
    width: 340px; max-width: calc(100vw - 16px); max-height: 420px; overflow-y: auto; border-radius: 16px;
    background: #0b0d11; color: #f4f7fb; border: 1px solid #23262e;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5); display: none;
  }
  .panel.open { display: block; }
  .panel-header {
    padding: 12px 16px; font-size: 13px; font-weight: 700; color: #bfff00;
    border-bottom: 1px solid #23262e; display: flex; justify-content: space-between;
    align-items: center;
  }
  .close { background: none; border: none; color: #8a93a3; cursor: pointer; font-size: 16px; }
  .header-actions { display: flex; align-items: center; gap: 4px; }
  .icon {
    width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center;
    background: none; border: none; border-radius: 8px; color: #8a93a3; cursor: pointer;
  }
  .icon:hover { background: #1a1d24; color: #f4f7fb; }
  .icon svg { width: 16px; height: 16px; }
  .all {
    border: none; border-radius: 8px; padding: 5px 10px; font-size: 11.5px; font-weight: 700;
    cursor: pointer; background: #1a1d24; color: #bfff00; margin-right: 2px;
  }
  .all:hover { background: #23262e; }
  .all:disabled { opacity: 0.6; cursor: default; }
  .item { padding: 12px 16px; border-bottom: 1px solid #1a1d24; display: flex; gap: 10px; }
  .thumb { width: 48px; height: 48px; border-radius: 8px; object-fit: cover; background: #1a1d24; flex-shrink: 0; }
  .thumb.placeholder {
    display: flex; align-items: center; justify-content: center;
    color: #5c6470; font-size: 11px; font-weight: 700;
  }
  .err { margin-top: 6px; font-size: 11px; line-height: 1.4; color: #ff6b6b; }
  .err:empty { display: none; }
  .meta { flex: 1; min-width: 0; }
  .title { font-size: 12.5px; line-height: 1.35; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .sub { font-size: 11px; color: #8a93a3; margin-top: 2px; }
  .actions { margin-top: 8px; display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  .btn {
    border: none; border-radius: 8px; padding: 6px 12px; font-size: 12px; font-weight: 700;
    cursor: pointer; background: #bfff00; color: #0b0d11;
  }
  .btn.secondary { background: #23262e; color: #f4f7fb; }
  .btn.send {
    background: transparent; color: #00e5ff; border: 1px solid rgba(0,229,255,0.4);
    display: inline-flex; align-items: center; justify-content: center;
    width: 30px; height: 28px; padding: 0;
  }
  .btn.send svg { width: 15px; height: 15px; }
  .btn:hover { filter: brightness(1.1); }
  .quality {
    background: #1a1d24; color: #f4f7fb; border: 1px solid #23262e; border-radius: 8px;
    padding: 6px 8px; font-size: 12px; font-weight: 600; cursor: pointer;
  }
  .btn:disabled { opacity: 0.75; cursor: default; }
  .btn.done { background: #23262e; color: #bfff00; }
  .btn.failed { background: #2e2326; color: #ff6b6b; }
  .spinner {
    display: inline-block; width: 11px; height: 11px; margin-right: 6px;
    border: 2px solid color-mix(in srgb, currentColor 30%, transparent);
    border-top-color: currentColor;
    border-radius: 50%; vertical-align: -2px;
    animation: acdl-spin 0.7s linear infinite;
  }
  @keyframes acdl-spin { to { transform: rotate(360deg); } }
  .footer { padding: 10px 16px; font-size: 11.5px; }
  .footer a { color: #00e5ff; text-decoration: none; font-weight: 600; }
  .cta {
    display: block; margin: 12px 16px; padding: 12px 14px; border-radius: 12px;
    background: linear-gradient(135deg, rgba(191,255,0,0.12), rgba(0,229,255,0.12));
    border: 1px solid rgba(191,255,0,0.35); color: #f4f7fb; text-decoration: none;
    font-size: 12.5px; line-height: 1.45;
  }
  .cta strong { color: #bfff00; }
  .empty { padding: 20px 16px; font-size: 12.5px; color: #8a93a3; }
  .stale { padding: 20px 16px; font-size: 12.5px; line-height: 1.5; color: #ffd166; }
`;

const LOGO_SVG = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 3v10m0 0l-4-4m4 4l4-4" stroke="#0b0d11" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M5 17h14v3H5z" fill="#0b0d11"/>
</svg>`;

/** Thumbnail, or a platform-initials tile when there is none or it fails to load. */
function thumbnailFor(item: MediaItem): HTMLElement {
  const placeholder = document.createElement('div');
  placeholder.className = 'thumb placeholder';
  placeholder.textContent = providerName(item.provider).slice(0, 2);
  if (!item.thumbnail) return placeholder;
  const img = document.createElement('img');
  img.className = 'thumb';
  img.alt = '';
  img.src = item.thumbnail;
  img.addEventListener('error', () => img.replaceWith(placeholder), { once: true });
  return img;
}

export function createPanel(options: PanelOptions): Panel {
  const rootHost = document.createElement('div');
  rootHost.id = 'autoclipper-dl-root';
  const shadow = rootHost.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = STYLES;
  shadow.appendChild(style);

  const fab = document.createElement('button');
  fab.className = 'fab';
  fab.setAttribute('aria-label', t('fabLabel'));
  fab.title = t('fabLabel');
  fab.innerHTML = `${LOGO_SVG}<span class="badge">0</span>`;
  shadow.appendChild(fab);

  const panel = document.createElement('div');
  panel.className = 'panel';
  shadow.appendChild(panel);

  const attach = () => {
    if (document.body && !rootHost.isConnected) document.body.appendChild(rootHost);
  };
  attach();
  document.addEventListener('DOMContentLoaded', attach);

  // --- Floating button: per-platform position + "hide on this site" ---
  let pref: FabPref = {};

  function fabOffsets(): { right: number; bottom: number } {
    return {
      right: clamp(
        pref.right ?? FAB_DEFAULT_OFFSET,
        FAB_EDGE_MARGIN,
        window.innerWidth - FAB_SIZE - FAB_EDGE_MARGIN,
      ),
      bottom: clamp(
        pref.bottom ?? FAB_DEFAULT_OFFSET,
        FAB_EDGE_MARGIN,
        window.innerHeight - FAB_SIZE - FAB_EDGE_MARGIN,
      ),
    };
  }

  /** Open the panel on whichever side of the button has room. */
  function positionPanel(): void {
    const { right, bottom } = fabOffsets();
    const fabTop = window.innerHeight - bottom - FAB_SIZE;
    const fabLeft = window.innerWidth - right - FAB_SIZE;
    const opensUp = fabTop + FAB_SIZE / 2 > window.innerHeight / 2;
    const room = opensUp
      ? fabTop - PANEL_GAP
      : window.innerHeight - (fabTop + FAB_SIZE + PANEL_GAP);
    panel.style.maxHeight = `${Math.max(160, Math.min(PANEL_MAX_HEIGHT, room - FAB_EDGE_MARGIN))}px`;
    panel.style.top = opensUp ? 'auto' : `${fabTop + FAB_SIZE + PANEL_GAP}px`;
    panel.style.bottom = opensUp ? `${bottom + FAB_SIZE + PANEL_GAP}px` : 'auto';
    const alignRight = fabLeft + FAB_SIZE / 2 > window.innerWidth / 2;
    panel.style.right = alignRight ? `${right}px` : 'auto';
    panel.style.left = alignRight ? 'auto' : `${fabLeft}px`;
  }

  function applyFabPref(): void {
    const { right, bottom } = fabOffsets();
    fab.style.right = `${right}px`;
    fab.style.bottom = `${bottom}px`;
    fab.classList.toggle('user-hidden', Boolean(pref.hidden));
    positionPanel();
  }

  async function saveFabPref(update: FabPref): Promise<void> {
    pref = { ...pref, ...update };
    applyFabPref();
    try {
      const stored = await chrome.storage.local.get(FAB_PREFS_KEY);
      const prefs = (stored[FAB_PREFS_KEY] as FabPrefs | undefined) ?? {};
      await chrome.storage.local.set({ [FAB_PREFS_KEY]: { ...prefs, [options.siteKey]: pref } });
    } catch {
      // Stale extension context: the position still applies until reload.
    }
  }

  void chrome.storage.local.get(FAB_PREFS_KEY).then((stored) => {
    pref = (stored[FAB_PREFS_KEY] as FabPrefs | undefined)?.[options.siteKey] ?? {};
    applyFabPref();
  });
  // The popup's "show floating button on this site" toggle writes here.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !(FAB_PREFS_KEY in changes)) return;
    pref = (changes[FAB_PREFS_KEY].newValue as FabPrefs | undefined)?.[options.siteKey] ?? {};
    applyFabPref();
  });
  window.addEventListener('resize', applyFabPref, { passive: true });

  let drag: { x: number; y: number; right: number; bottom: number; moved: boolean } | null = null;
  let suppressClick = false;
  fab.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    drag = { x: event.clientX, y: event.clientY, ...fabOffsets(), moved: false };
    fab.setPointerCapture(event.pointerId);
  });
  fab.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    drag.moved = true;
    fab.classList.add('dragging');
    pref = { ...pref, right: drag.right - dx, bottom: drag.bottom - dy };
    applyFabPref();
  });
  const endDrag = () => {
    if (drag?.moved) {
      suppressClick = true;
      void saveFabPref(fabOffsets());
    }
    drag = null;
    fab.classList.remove('dragging');
  };
  fab.addEventListener('pointerup', endDrag);
  fab.addEventListener('pointercancel', endDrag);

  fab.addEventListener('click', () => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    positionPanel();
    panel.classList.toggle('open');
  });

  let currentItems: MediaItem[] = [];
  let youtubeUrl = '';
  const statuses = new Map<string, DownloadStatus>();
  const errors = new Map<string, string>();

  function applyError(line: HTMLElement, url: string): void {
    const reason = statuses.get(url) === 'interrupted' ? errors.get(url) : undefined;
    line.textContent = reason ? t(reason) : '';
  }

  let allButton: HTMLButtonElement | null = null;

  /** Listed videos not already saved or in flight ("Download all" targets). */
  function pendingItems(): MediaItem[] {
    return currentItems.filter((item) => {
      const status = statuses.get(item.url);
      return status !== 'downloading' && status !== 'complete';
    });
  }

  function updateAllButton(): void {
    if (!allButton?.isConnected) return;
    const count = pendingItems().length;
    allButton.textContent = t('downloadAll', [String(count)]);
    allButton.disabled = count === 0;
  }

  function refresh(url: string): void {
    updateAllButton();
    for (const el of panel.querySelectorAll<HTMLElement>('[data-url]')) {
      if (el.dataset.url !== url) continue;
      if (el instanceof HTMLButtonElement) {
        applyStatus(el, url, el.dataset.idleLabel ?? t('downloadVideo'));
      } else if (el.classList.contains('err')) {
        applyError(el, url);
      }
    }
  }

  function applyStatus(button: HTMLButtonElement, url: string, idleLabel: string): void {
    const status = statuses.get(url);
    button.disabled = status === 'downloading';
    button.classList.toggle('done', status === 'complete');
    button.classList.toggle('failed', status === 'interrupted');
    if (status === 'downloading') {
      button.replaceChildren();
      button.appendChild(Object.assign(document.createElement('span'), { className: 'spinner' }));
      button.appendChild(document.createTextNode(t('downloading')));
    } else if (status === 'complete') {
      button.textContent = t('saved');
    } else if (status === 'interrupted') {
      button.textContent = t('downloadError');
    } else {
      button.textContent = idleLabel;
    }
  }

  function render(): void {
    const badge = fab.querySelector('.badge')!;
    panel.replaceChildren();
    allButton = null;

    const header = document.createElement('div');
    header.className = 'panel-header';
    header.textContent = 'AutoClipper';
    const headerActions = document.createElement('div');
    headerActions.className = 'header-actions';

    if (options.mode === 'download' && currentItems.length > 1) {
      const all = document.createElement('button');
      all.className = 'all';
      allButton = all;
      updateAllButton();
      all.addEventListener('click', () => {
        pendingItems().forEach((item, i) =>
          setTimeout(
            () => options.onDownload(item.url, item.filename, downloadMetaFor(item)),
            i * DOWNLOAD_ALL_STAGGER_MS,
          ),
        );
      });
      headerActions.appendChild(all);
    }

    const hide = document.createElement('button');
    hide.className = 'icon';
    hide.innerHTML = EYE_OFF_ICON;
    hide.title = t('hideFabTitle');
    hide.setAttribute('aria-label', t('hideFab'));
    hide.addEventListener('click', () => {
      panel.classList.remove('open');
      void saveFabPref({ hidden: true });
    });
    headerActions.appendChild(hide);

    const close = document.createElement('button');
    close.className = 'close icon';
    close.textContent = '✕';
    close.setAttribute('aria-label', t('close'));
    close.addEventListener('click', () => panel.classList.remove('open'));
    headerActions.appendChild(close);
    header.appendChild(headerActions);
    panel.appendChild(header);

    if (options.mode === 'youtube') {
      fab.classList.add('visible');
      badge.textContent = '▶';
      const cta = document.createElement('a');
      cta.className = 'cta';
      cta.target = '_blank';
      cta.rel = 'noopener';
      // Long-form watch pages get "Send to AutoClipper" — a deep link into
      // the app that starts processing this video (see /projects?video=).
      const isWatchPage = /\/watch\b|\/live\//.test(safePathname(youtubeUrl));
      if (isWatchPage) {
        cta.href = `https://app.autoclipper.live/projects?video=${encodeURIComponent(youtubeUrl)}&utm_source=chrome-extension&utm_medium=youtube-send`;
        cta.innerHTML = `<strong>${t('sendToAutoclipperTitle')}</strong><br/>${t('sendToAutoclipperBody')}`;
      } else {
        cta.href = `https://autoclipper.live/?utm_source=chrome-extension&utm_medium=youtube-cta&video=${encodeURIComponent(youtubeUrl)}`;
        cta.innerHTML = `<strong>${t('youtubeCtaTitle')}</strong><br/>${t('youtubeCtaBody')}`;
      }
      panel.appendChild(cta);
    } else {
      badge.textContent = String(currentItems.length);
      fab.classList.toggle('visible', currentItems.length > 0);

      if (currentItems.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = t('noVideosFound');
        panel.appendChild(empty);
      }

      for (const item of currentItems) {
        const row = document.createElement('div');
        row.className = 'item';

        row.appendChild(thumbnailFor(item));

        const meta = document.createElement('div');
        meta.className = 'meta';
        const title = document.createElement('div');
        title.className = 'title';
        title.textContent = item.title || item.pageUrl;
        meta.appendChild(title);
        const sub = document.createElement('div');
        sub.className = 'sub';
        sub.textContent = [providerName(item.provider), item.quality].filter(Boolean).join(' · ');
        meta.appendChild(sub);

        const actions = document.createElement('div');
        actions.className = 'actions';

        // Quality picker: the download button tracks the selected variant.
        const variants = item.variants?.filter((v) => v.url) ?? [];
        let selectedUrl = item.url;

        const downloadMeta = downloadMetaFor(item);

        const dl = document.createElement('button');
        dl.className = 'btn';
        dl.dataset.url = selectedUrl;
        dl.dataset.idleLabel = t('downloadVideo');
        applyStatus(dl, selectedUrl, t('downloadVideo'));
        dl.addEventListener('click', () =>
          options.onDownload(selectedUrl, item.filename, downloadMeta),
        );
        actions.appendChild(dl);

        if (variants.length > 1) {
          const select = document.createElement('select');
          select.className = 'quality';
          select.setAttribute('aria-label', t('qualityLabel'));
          for (const variant of variants) {
            const opt = document.createElement('option');
            opt.value = variant.url;
            opt.textContent = variant.quality ?? t('downloadVideo');
            select.appendChild(opt);
          }
          select.addEventListener('change', () => {
            selectedUrl = select.value;
            dl.dataset.url = selectedUrl;
            applyStatus(dl, selectedUrl, t('downloadVideo'));
            const err = row.querySelector<HTMLElement>('.err');
            if (err) {
              err.dataset.url = selectedUrl;
              applyError(err, selectedUrl);
            }
          });
          actions.appendChild(select);
        }

        // Reddit separate-audio manual fallback (mux is automatic above).
        if (item.audioUrl) {
          const audio = document.createElement('button');
          audio.className = 'btn secondary';
          audio.dataset.url = item.audioUrl;
          audio.dataset.idleLabel = t('downloadAudio');
          applyStatus(audio, item.audioUrl, t('downloadAudio'));
          audio.addEventListener('click', () =>
            options.onDownload(item.audioUrl!, item.filename.replace(/\.mp4$/, '-audio.mp4')),
          );
          actions.appendChild(audio);
        }

        // Send to AutoClipper: process this video into clips in the app.
        const send = document.createElement('a');
        send.className = 'btn send';
        send.href = APP_SEND_URL(item.pageUrl);
        send.target = '_blank';
        send.rel = 'noopener';
        send.title = t('sendToAutoclipperShort');
        send.setAttribute('aria-label', t('sendToAutoclipperShort'));
        send.innerHTML = SCISSORS_ICON;
        actions.appendChild(send);

        meta.appendChild(actions);
        const err = document.createElement('div');
        err.className = 'err';
        err.dataset.url = selectedUrl;
        applyError(err, selectedUrl);
        meta.appendChild(err);
        row.appendChild(meta);
        panel.appendChild(row);
      }
    }

    const footer = document.createElement('div');
    footer.className = 'footer';
    const link = document.createElement('a');
    link.href = SITE_URL;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = t('poweredBy');
    footer.appendChild(link);
    panel.appendChild(footer);
  }

  render();

  return {
    setItems(items: MediaItem[]) {
      // While the panel is open, a pure re-order (on-screen video changed)
      // would re-render under the user's cursor and close an open quality
      // picker. Keep the current order until new videos actually arrive.
      const sameSet =
        items.length === currentItems.length &&
        items.every((item) => currentItems.some((c) => c.id === item.id));
      currentItems = panel.classList.contains('open') && sameSet ? currentItems : items;
      if (!sameSet || !panel.classList.contains('open')) render();
    },
    setYouTubeUrl(url: string) {
      youtubeUrl = url;
      render();
    },
    setStatus(url: string, status: DownloadStatus, error?: string) {
      if (status === 'canceled') statuses.delete(url);
      else statuses.set(url, status);
      if (status === 'interrupted') errors.set(url, failureReasonKey(error));
      refresh(url);
    },
    resetIfDownloading(url: string) {
      if (statuses.get(url) !== 'downloading') return;
      statuses.delete(url);
      refresh(url);
    },
    open() {
      positionPanel();
      panel.classList.add('open');
    },
    showStaleNotice() {
      // The i18n bundle is unreachable once the context is invalidated, so
      // this string is hardcoded bilingually.
      const notice = document.createElement('div');
      notice.className = 'stale';
      notice.textContent =
        'AutoClipper was updated — refresh this page to keep downloading. / ' +
        'O AutoClipper foi atualizado — recarregue esta página para continuar baixando.';
      panel.replaceChildren(notice);
      panel.classList.add('open');
    },
  };
}
