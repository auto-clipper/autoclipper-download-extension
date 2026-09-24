/**
 * Site match patterns, shared by the manifest (content scripts) and the
 * background worker (context-menu scoping). Plain data, no chrome.* — the
 * manifest is evaluated in Node at build time.
 */

export const SOCIAL_MATCHES = [
  'https://www.instagram.com/*',
  'https://instagram.com/*',
  'https://www.tiktok.com/*',
  'https://tiktok.com/*',
  'https://twitter.com/*',
  'https://x.com/*',
  'https://www.twitch.tv/*',
  'https://m.twitch.tv/*',
  'https://clips.twitch.tv/*',
];

export const REDDIT_MATCHES = [
  'https://www.reddit.com/*',
  'https://old.reddit.com/*',
  'https://reddit.com/*',
];

export const YOUTUBE_MATCHES = ['https://www.youtube.com/*', 'https://m.youtube.com/*'];

/** Long-form YouTube pages the app can import (Shorts keep the landing CTA). */
export const YOUTUBE_WATCH_MATCHES = [
  'https://www.youtube.com/watch*',
  'https://www.youtube.com/live/*',
  'https://m.youtube.com/watch*',
];

export const AUTOCLIPPER_APP_MATCHES = ['https://app.autoclipper.live/*'];
