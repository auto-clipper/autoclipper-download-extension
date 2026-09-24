# CLAUDE.md — AutoClipper Video Downloader

Chrome MV3 extension. Read `README.md` first for architecture; this file only adds working rules.

## Non-negotiable constraints

1. **Never add YouTube download capability.** Chrome Web Store policy forbids it; violating this gets the extension (and the SEO strategy behind it) taken down. YouTube pages get the autoclipper.live CTA only.
2. **Keep permissions minimal.** `downloads` + `storage` + `offscreen` (Reddit muxing) + `contextMenus` (right-click download) and content-script matches only (social sites + `app.autoclipper.live` for sign-in status). Do not add `host_permissions`, `webRequest`, `tabs` or `<all_urls>` without a strong reason — each addition slows or blocks store review.
3. **Deep-link contract with the app:** `https://app.autoclipper.live/projects?video=<encoded URL>` starts the URL-upload flow (frontend `src/lib/content/parseVideoDeepLink.ts` in autoclipper-new-frontend). If you change the param name or route here, change the frontend in the same PR.
4. **The extension exists to drive traffic to https://autoclipper.live.** Keep the branding, `homepage_url`, panel/popup links and UTM parameters intact.

## Architecture rules

- New site support = one new module in `src/providers/` implementing the `Provider` interface + a fixture in `tests/fixtures/` + a test. Register it in `src/providers/registry.ts`. Extractors must never throw and must return `[]` on unrecognized payloads.
- Extractors are pure functions (no `chrome.*`, no DOM) so they stay unit-testable in Node.
- The MAIN-world interceptor must stay observation-only: never modify requests/responses, never break page behavior. Guard everything in try/catch.
- UI strings go through `chrome.i18n` — add every new key to **both** `public/_locales/en/messages.json` and `public/_locales/pt_BR/messages.json`.
- The panel renders inside a closed shadow root; keep styles self-contained (no page CSS leakage in either direction).
- **The popup cannot read `tab.url`** (no `tabs` permission; content-script matches don't grant it). It asks the page's content script instead (`get-page-info` → `PageInfo`). No answer = unsupported site or a tab still running a pre-update content script.
- Site match patterns live in `src/shared/sites.ts`, shared by the manifest and the background worker (context-menu scoping). Add a site there, not inline.
- The on-video buttons (`src/content/inline.ts`) float in their own fixed layer and never inject into site player markup. Player↔item pairing stays in the pure `src/content/match.ts` (unit-tested in `tests/match.test.ts`); site-specific DOM quirks go into `contextLevels()`, not the matcher.

## Landing page

`docs/` is the GitHub Pages site (static HTML, no build step) — English at `docs/index.html`, pt-BR at `docs/pt/index.html`, privacy policy at `docs/privacy.html`. Keep hreflang tags and autoclipper.live links when editing.

## Checks before committing

```bash
npm run lint:fix && npm test && npm run build
```

## Releases

Bump `version` in `src/manifest.ts` + `package.json`, then `npm run zip` and follow `store/publishing-checklist.md`.
