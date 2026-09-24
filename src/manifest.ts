import { defineManifest } from '@crxjs/vite-plugin';
import {
  AUTOCLIPPER_APP_MATCHES,
  REDDIT_MATCHES,
  SOCIAL_MATCHES,
  YOUTUBE_MATCHES,
} from './shared/sites';

export default defineManifest({
  manifest_version: 3,
  name: '__MSG_extName__',
  short_name: 'AutoClipper DL',
  description: '__MSG_extDescription__',
  default_locale: 'en',
  version: '0.4.0',
  minimum_chrome_version: '111',
  homepage_url: 'https://autoclipper.live',
  icons: {
    16: 'icons/icon16.png',
    32: 'icons/icon32.png',
    48: 'icons/icon48.png',
    128: 'icons/icon128.png',
  },
  action: {
    default_popup: 'src/popup/index.html',
    default_icon: {
      16: 'icons/icon16.png',
      32: 'icons/icon32.png',
      48: 'icons/icon48.png',
    },
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: [...SOCIAL_MATCHES, ...REDDIT_MATCHES, ...YOUTUBE_MATCHES],
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
    },
    {
      matches: SOCIAL_MATCHES,
      js: ['src/interceptor/index.ts'],
      run_at: 'document_start',
      // Runs in the page's JS context so it can observe fetch/XHR payloads.
      world: 'MAIN',
    },
    {
      // Mirrors the app's login state into the extension (popup greeting).
      matches: AUTOCLIPPER_APP_MATCHES,
      js: ['src/content/autoclipper.ts'],
      run_at: 'document_idle',
    },
  ],
  // contextMenus: "Download this video" on right-click (no install warning).
  permissions: ['downloads', 'storage', 'offscreen', 'contextMenus'],
  commands: {
    'download-video': {
      suggested_key: { default: 'Alt+Shift+D' },
      description: '__MSG_commandDownload__',
    },
  },
});
