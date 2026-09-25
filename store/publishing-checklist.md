# Publishing checklist — Chrome Web Store

One-time setup:

- [ ] Chrome Web Store developer account ($5 one-time fee) on the Google account that owns AutoClipper assets
- [ ] Verify the `autoclipper.live` domain in the developer dashboard (Search Console) so the listing can claim the "By autoclipper.live" byline

Per release:

1. Bump `version` in `src/manifest.ts` and `package.json`
2. `npm run zip` → produces `autoclipper-download-extension.zip`
3. Upload the zip in the [developer dashboard](https://chrome.google.com/webstore/devconsole)
4. Listing content: copy from `store/listing-en.md` and `store/listing-pt-br.md` (add pt-BR and es as additional listing languages; the extension ships en/pt_BR/es locales)
5. Screenshots: ready-made 1280x800 promo tiles in `store/screenshots/` (regenerate via `store/screenshots-src/*.html` + headless Chrome); optionally add real in-situ captures per site
6. Privacy tab:
   - Single purpose: "Download videos from supported social networks"
   - Permission justifications: `downloads` (save the video file), `storage` (detected videos per tab, download history, AutoClipper sign-in status, review-prompt counter), `offscreen` (mux Reddit's separate video + audio tracks into one MP4), `contextMenus` (right-click "Download this video" on supported sites; "Clip this video with AutoClipper" on YouTube watch pages), site access to app.autoclipper.live (our own web app — shows the user's sign-in status in the popup)
   - After the item is published, set `STORE_ITEM_ID` in `src/shared/constants.ts` to the real listing id (enables the in-popup review prompt) and swap the landing page's "Add to Chrome" CTA to the store URL.
   - Data usage: "Does not collect user data"
   - Privacy policy URL: https://auto-clipper.github.io/autoclipper-download-extension/privacy.html
7. Submit for review

Policy notes (do not regress):

- **Never add YouTube download capability** — instant rejection/takedown (CWS policy + YouTube ToS). YouTube gets the autoclipper.live CTA only.
- Keep permissions minimal; adding broad host permissions or `webRequest` triggers in-depth review.
- The extension must not inject ads or affiliate links into pages.
- **No status/promo keywords in any listing asset** (screenshots, promo tiles, summary, description): no "free", "100% free", "#1", "best", "recommended", "premium", "new", "top" badges or claims. v0.4.0 was rejected ("Red Nickel" — impersonation/misleading metadata) for a "100% free" pill in screenshot 3.
