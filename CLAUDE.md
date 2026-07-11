# CLAUDE.md — AutoClipper Video Downloader

Chrome MV3 extension. Read `README.md` first for architecture; this file only adds working rules.

## Non-negotiable constraints

1. **Never add YouTube download capability.** Chrome Web Store policy forbids it; violating this gets the extension (and the SEO strategy behind it) taken down. YouTube pages get the autoclipper.live CTA only.
2. **Keep permissions minimal.** `downloads` + `storage` and content-script matches only (social sites + `app.autoclipper.live` for sign-in status). Do not add `host_permissions`, `webRequest`, `tabs` or `<all_urls>` without a strong reason — each addition slows or blocks store review.
3. **Deep-link contract with the app:** `https://app.autoclipper.live/projects?video=<encoded URL>` starts the URL-upload flow (frontend `src/lib/content/parseVideoDeepLink.ts` in autoclipper-new-frontend). If you change the param name or route here, change the frontend in the same PR.
4. **The extension exists to drive traffic to https://autoclipper.live.** Keep the branding, `homepage_url`, panel/popup links and UTM parameters intact.

## Architecture rules

- New site support = one new module in `src/providers/` implementing the `Provider` interface + a fixture in `tests/fixtures/` + a test. Register it in `src/providers/registry.ts`. Extractors must never throw and must return `[]` on unrecognized payloads.
- Extractors are pure functions (no `chrome.*`, no DOM) so they stay unit-testable in Node.
- The MAIN-world interceptor must stay observation-only: never modify requests/responses, never break page behavior. Guard everything in try/catch.
- UI strings go through `chrome.i18n` — add every new key to **both** `public/_locales/en/messages.json` and `public/_locales/pt_BR/messages.json`.
- The panel renders inside a closed shadow root; keep styles self-contained (no page CSS leakage in either direction).

## Landing page

`docs/` is the GitHub Pages site (static HTML, no build step) — English at `docs/index.html`, pt-BR at `docs/pt/index.html`, privacy policy at `docs/privacy.html`. Keep hreflang tags and autoclipper.live links when editing.

## Checks before committing

```bash
npm run lint:fix && npm test && npm run build
```

## Releases

Bump `version` in `src/manifest.ts` + `package.json`, then `npm run zip` and follow `store/publishing-checklist.md`.
