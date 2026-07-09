# Design — AutoClipper Video Downloader (2026-07-09)

Approved design for v1. See README.md for the as-built architecture summary.

## Purpose

Free Chrome MV3 extension on the Chrome Web Store that downloads videos from social platforms, branded AutoClipper. Strategic goal: SEO/traffic — the store listing, the GitHub Pages landing page and every UI surface link back to https://autoclipper.live.

## Decisions (with rationale)

| Decision | Choice | Why |
| --- | --- | --- |
| YouTube | No download; CTA deep-links to autoclipper.live | Chrome Web Store policy forbids YouTube-download extensions; a takedown would kill the SEO play. The CTA converts the constraint into site traffic. |
| Download engine | Client-side only | No server costs or infra; `chrome.downloads` carries the user's cookies, which signed CDN URLs need. |
| v1 providers | Instagram, TikTok, Reddit, X | Highest search volume; each is feasible client-side. Provider registry makes adding more one module of work. |
| Language | pt-BR + English (`chrome.i18n`) | Brazilian core audience + English search reach. |
| Popup stack | React + Tailwind v4 via Vite + CRXJS | Matches team conventions. |
| Repo | Public, `auto-clipper/autoclipper-download-extension` | Extra SEO surface + store-review trust. |
| Landing page | GitHub Pages from `docs/` on main | Zero build step; en + pt-BR pages with hreflang; hosts the privacy policy the store requires. |

## Architecture

MAIN-world interceptor (fetch/XHR observation) → pure provider extractors → content script (floating shadow-DOM panel, Reddit `.json` fetch, TikTok SSR-state parse) → background service worker (per-tab media in `storage.session`, badge, `chrome.downloads`) → popup mirrors the panel. Full description in README.md.

## v1 known limitations

- Reddit audio offered as a separate download (no client-side muxing yet; v2 candidate: offscreen document + ffmpeg.wasm).
- Extractors are shape-tolerant but will need maintenance as sites change APIs.

## Deferred (explicitly out of v1)

- Client-side DASH muxing for Reddit
- Facebook, Pinterest, LinkedIn, Twitch clips providers
- Options page (quality selection, filename templates)
- Download history
