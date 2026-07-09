import type { MediaItem } from '@/shared/types';

interface PanelOptions {
  mode: 'download' | 'youtube';
  onDownload: (url: string, filename: string) => void;
}

interface Panel {
  setItems(items: MediaItem[]): void;
  setYouTubeUrl(url: string): void;
}

const t = (key: string, subs?: string[]) => chrome.i18n.getMessage(key, subs) || key;

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
  .meta { flex: 1; min-width: 0; }
  .title { font-size: 12.5px; line-height: 1.35; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .sub { font-size: 11px; color: #8a93a3; margin-top: 2px; }
  .actions { margin-top: 8px; display: flex; gap: 6px; flex-wrap: wrap; }
  .btn {
    border: none; border-radius: 8px; padding: 6px 12px; font-size: 12px; font-weight: 700;
    cursor: pointer; background: #bfff00; color: #0b0d11;
  }
  .btn.secondary { background: #23262e; color: #f4f7fb; }
  .btn:hover { filter: brightness(1.1); }
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
`;

const LOGO_SVG = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 3v10m0 0l-4-4m4 4l4-4" stroke="#0b0d11" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M5 17h14v3H5z" fill="#0b0d11"/>
</svg>`;

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
      cta.href = `https://autoclipper.live/?utm_source=chrome-extension&utm_medium=youtube-cta&video=${encodeURIComponent(youtubeUrl)}`;
      cta.innerHTML = `<strong>${t('youtubeCtaTitle')}</strong><br/>${t('youtubeCtaBody')}`;
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

        if (item.thumbnail) {
          const img = document.createElement('img');
          img.className = 'thumb';
          img.src = item.thumbnail;
          row.appendChild(img);
        }

        const meta = document.createElement('div');
        meta.className = 'meta';
        const title = document.createElement('div');
        title.className = 'title';
        title.textContent = item.title || item.pageUrl;
        meta.appendChild(title);
        const sub = document.createElement('div');
        sub.className = 'sub';
        sub.textContent = [item.provider, item.quality].filter(Boolean).join(' · ');
        meta.appendChild(sub);

        const actions = document.createElement('div');
        actions.className = 'actions';
        const dl = document.createElement('button');
        dl.className = 'btn';
        dl.textContent = t('downloadVideo');
        dl.addEventListener('click', () => options.onDownload(item.url, item.filename));
        actions.appendChild(dl);

        if (item.audioUrl) {
          const audio = document.createElement('button');
          audio.className = 'btn secondary';
          audio.textContent = t('downloadAudio');
          audio.addEventListener('click', () =>
            options.onDownload(item.audioUrl!, item.filename.replace(/\.mp4$/, '-audio.mp4')),
          );
          actions.appendChild(audio);
        }
        meta.appendChild(actions);
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
      currentItems = items;
      render();
    },
    setYouTubeUrl(url: string) {
      youtubeUrl = url;
      render();
    },
  };
}
