# AutoClipper Video Downloader — Chrome Extension

Chrome (MV3) extension that downloads videos from **Instagram, TikTok, Reddit, X (Twitter) and Twitch clips** in one click, branded [AutoClipper](https://autoclipper.live). On **YouTube** it shows a "clip it with AutoClipper" call-to-action instead of downloading (Chrome Web Store policy forbids YouTube downloads).

## Features

- **One-click downloads** from Instagram, TikTok, Reddit, X and Twitch clips (client-side; no server).
- **On-video download button** — hovering a video player shows a "Download" button (plus a "Send to AutoClipper" scissors button) right on the video. Can be turned off from the popup.
- **Quality picker** — pick from every rendition the site exposes (Reddit permutations, X bitrates, Instagram versions, Twitch qualities).
- **Reddit audio muxing** — separate DASH/CMAF video + audio tracks are fetched and muxed into one MP4 in an offscreen document (mp4box.js). Falls back to a video-only + separate-audio download if muxing fails.
- **Send to AutoClipper** — every detected video (and long-form YouTube pages) links into the app at `/projects?video=<url>` to turn it into captioned clips.
- **Sign-in status** — the popup greets AutoClipper users (read from app.autoclipper.live localStorage, never the token) or offers a login button.
- **Download history** in the popup, with "show in folder" and re-download.
- **Review prompt** after a few successful downloads (once the store id is set).
- **Install / uninstall pages** on the GitHub Pages site for onboarding and uninstall feedback.
- **Localized** in English, Portuguese (BR) and Spanish.

Landing page (GitHub Pages, served from `docs/`): https://auto-clipper.github.io/autoclipper-download-extension/

## How it works

- A **MAIN-world interceptor** (`src/interceptor/`) observes `fetch`/XHR JSON responses on Instagram, TikTok and X — these sites only expose real MP4 URLs inside API payloads (the `<video>` tags use `blob:` URLs).
- **Providers** (`src/providers/`) are pure extractor functions that fish media descriptors out of those payloads. One module per site, unit-tested against fixtures in `tests/fixtures/`.
- The **content script** (`src/content/`) merges detections, renders the floating panel (shadow DOM, closed root) and relays items to the background worker. Reddit is handled here by fetching the post's public `<permalink>.json`. TikTok's server-rendered first video is read from the `__UNIVERSAL_DATA_FOR_REHYDRATION__` script tag.
- The **inline buttons** (`src/content/inline.ts`) float a Download / Send-to-AutoClipper pill over each visible video player while it is hovered. They live in their own fixed-position closed-shadow layer that tracks each player's bounding box (site players clip overflow and re-render their markup). Players are paired with detected items by `src/content/match.ts` — a pure matcher that looks for an item's media id / post path in the player's poster, its ancestors' ids/`permalink` attributes and the links inside its post, nearest first; single-video pages fall back to the id in the URL. Reddit anchors on the `shreddit-player` host (its `<video>` sits in a shadow root). Disabled via the `inlineButtons` flag in `chrome.storage.local` (popup toggle).
- The **background service worker** (`src/background/`) stores detected media per tab in `chrome.storage.session`, sets the badge count, performs downloads via `chrome.downloads` (browser downloads carry the user's cookies, which signed CDN URLs often require), maintains the download history, tracks the review-prompt counter, and opens the install page / sets the uninstall URL.
- The **offscreen document** (`src/offscreen/`) fetches and muxes Reddit's separate video + audio tracks into one MP4 (`src/lib/mux.ts`, mp4box.js). The MV3 service worker can't create blob URLs, so muxing lives here; the resulting `blob:` URL is handed to `chrome.downloads`.
- The **popup** (`src/popup/`, React + Tailwind) mirrors the panel for the active tab.

Files are saved to `Downloads/autoclipper/<provider>-<title-or-id>.mp4`.

## AutoClipper app integration

- **Send to AutoClipper** — on YouTube watch/live pages, the panel and popup show a "Send to AutoClipper" CTA that deep-links into the app: `https://app.autoclipper.live/projects?video=<encoded video URL>`. The app's `/projects` page consumes the `video` query param and starts the URL-upload flow automatically (frontend: `parseVideoDeepLink` + effect in `ProjectsListPage`). The param survives the login redirect (`/login?redirect=...`). YouTube Shorts keep the generic landing-page CTA.
- **Sign-in status** — a content script on `app.autoclipper.live` (`src/content/autoclipper.ts`) mirrors the app's localStorage login state (username/email only, never the token) into `chrome.storage.local`, so the popup greets logged-in users and shows a "Sign in with AutoClipper" button otherwise. This data never leaves the browser.

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
- [ ] Hovering a video shows the on-video Download button; it downloads *that* video (check a feed with several videos on X, Reddit, Instagram and TikTok); it hides behind page modals and when the popup toggle is off
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
