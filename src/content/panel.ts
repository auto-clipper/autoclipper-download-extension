import type { DownloadMeta, DownloadStatus, MediaItem } from '@/shared/types';
import { failureReasonKey, providerName } from '@/shared/labels';

interface PanelOptions {
  mode: 'download' | 'youtube';
  onDownload: (url: string, filename: string, meta?: DownloadMeta) => void;
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
  .fab svg { width: 26px; height: 26px; }
  .badge {
    position: absolute; top: -6px; right: -6px; min-width: 20px; height: 20px;
    border-radius: 10px; background: #0b0d11; color: #bfff00;
    font-size: 12px; font-weight: 700; display: flex; align-items: center;
    justify-content: center; padding: 0 5px; border: 1px solid #bfff00;
  }
  .panel {
    position: fixed; bottom: 88px; right: 24px; z-index: 2147483646;
    width: 340px; max-height: 420px; overflow-y: auto; border-radius: 16px;
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
    display: inline-flex; align-items: center; gap: 4px;
  }
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

  fab.addEventListener('click', () => panel.classList.toggle('open'));

  let currentItems: MediaItem[] = [];
  let youtubeUrl = '';
  const statuses = new Map<string, DownloadStatus>();
  const errors = new Map<string, string>();

  function applyError(line: HTMLElement, url: string): void {
    const reason = statuses.get(url) === 'interrupted' ? errors.get(url) : undefined;
    line.textContent = reason ? t(reason) : '';
  }

  function refresh(url: string): void {
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

    const header = document.createElement('div');
    header.className = 'panel-header';
    header.textContent = 'AutoClipper';
    const close = document.createElement('button');
    close.className = 'close';
    close.textContent = '✕';
    close.addEventListener('click', () => panel.classList.remove('open'));
    header.appendChild(close);
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

        const downloadMeta: DownloadMeta = {
          provider: item.provider,
          title: item.title,
          pageUrl: item.pageUrl,
          // Reddit fallback path: mux the separate audio track in.
          audioUrl: item.audioUrl,
        };

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
        send.textContent = t('sendToAutoclipperShort');
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
