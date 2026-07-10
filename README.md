# AutoClipper Video Downloader — Chrome Extension

Chrome (MV3) extension that downloads videos from **Instagram, TikTok, Reddit and X (Twitter)** in one click, branded [AutoClipper](https://autoclipper.live). On **YouTube** it shows a "clip it with AutoClipper" call-to-action instead of downloading (Chrome Web Store policy forbids YouTube downloads).

Landing page (GitHub Pages, served from `docs/`): https://auto-clipper.github.io/autoclipper-download-extension/

## How it works

- A **MAIN-world interceptor** (`src/interceptor/`) observes `fetch`/XHR JSON responses on Instagram, TikTok and X — these sites only expose real MP4 URLs inside API payloads (the `<video>` tags use `blob:` URLs).
- **Providers** (`src/providers/`) are pure extractor functions that fish media descriptors out of those payloads. One module per site, unit-tested against fixtures in `tests/fixtures/`.
- The **content script** (`src/content/`) merges detections, renders the floating panel (shadow DOM, closed root) and relays items to the background worker. Reddit is handled here by fetching the post's public `<permalink>.json`. TikTok's server-rendered first video is read from the `__UNIVERSAL_DATA_FOR_REHYDRATION__` script tag.
- The **background service worker** (`src/background/`) stores detected media per tab in `chrome.storage.session`, sets the badge count and performs downloads via `chrome.downloads` (browser downloads carry the user's cookies, which signed CDN URLs often require).
- The **popup** (`src/popup/`, React + Tailwind) mirrors the panel for the active tab.

Files are saved to `Downloads/autoclipper/<provider>-<title-or-id>.mp4`.

## Development

```bash
npm install
npm run dev        # Vite dev server with CRXJS HMR
npm run build      # typecheck + production build into dist/
npm test           # provider extractor unit tests (vitest)
npm run lint       # eslint
npm run icons      # regenerate public/icons/*.png from scripts/icon.svg (needs ImageMagick)
npm run zip        # build + zip for Chrome Web Store upload
```

Load in Chrome: `chrome://extensions` → enable Developer mode → "Load unpacked" → select `dist/`.

## Manual test checklist (before each release)

- [ ] Instagram: open a Reel → panel button appears → download saves a playable MP4
- [ ] TikTok: open a video page and scroll the feed → items appear → download works
- [ ] X: open a tweet with video → highest-quality MP4 downloads
- [ ] Reddit: open a v.redd.it post → video downloads; audio button appears when the post has audio
- [ ] YouTube: panel shows the AutoClipper CTA and links to autoclipper.live with the video URL
- [ ] Popup mirrors the page's detected videos; badge shows the count
- [ ] Both locales render (`chrome://settings/languages` → move pt-BR to top to test)

## Troubleshooting

- **After reloading the extension** (`chrome://extensions` → ↻) or rebuilding `dist/`, refresh any social-network tabs that were already open. Chrome orphans the old content scripts in those tabs — the panel shows an "extension updated, refresh the page" notice if you click a button there. This affects development only; store users get updates on browser restart.

## Known limitations

- **Reddit**: videos are detected in feeds and on post pages by reading the shreddit players' `packaged-media-json` (complete MP4s with audio muxed in — served from packaged-media.redd.it). The post-JSON fallback path (old.reddit, posts without packaged media) still yields the separate video/audio DASH-or-CMAF tracks with no client-side muxing; there the audio is offered as a second download.
- **Stories/live**: not explicitly targeted; whatever the interceptor catches, works.
- Sites change their APIs regularly — the extractors are shape-tolerant (recursive JSON walk), but expect occasional maintenance. Fixtures in `tests/fixtures/` document the shapes we rely on.

## Publishing

See [store/publishing-checklist.md](store/publishing-checklist.md). Listing copy lives in [store/listing-en.md](store/listing-en.md) and [store/listing-pt-br.md](store/listing-pt-br.md).

**Policy invariant: never add YouTube download capability** — it gets the extension removed from the Chrome Web Store.
