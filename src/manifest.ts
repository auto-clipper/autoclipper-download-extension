import { defineManifest } from '@crxjs/vite-plugin';

const SOCIAL_MATCHES = [
  'https://www.instagram.com/*',
  'https://instagram.com/*',
  'https://www.tiktok.com/*',
  'https://tiktok.com/*',
  'https://twitter.com/*',
  'https://x.com/*',
];

const REDDIT_MATCHES = [
  'https://www.reddit.com/*',
  'https://old.reddit.com/*',
  'https://reddit.com/*',
];

const YOUTUBE_MATCHES = ['https://www.youtube.com/*', 'https://m.youtube.com/*'];

export default defineManifest({
  manifest_version: 3,
  name: '__MSG_extName__',
  short_name: 'AutoClipper DL',
  description: '__MSG_extDescription__',
  default_locale: 'en',
  version: '0.1.0',
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
  ],
  permissions: ['downloads', 'storage'],
});
