# Publishing checklist — Chrome Web Store

One-time setup:

- [ ] Chrome Web Store developer account ($5 one-time fee) on the Google account that owns AutoClipper assets
- [ ] Verify the `autoclipper.live` domain in the developer dashboard (Search Console) so the listing can claim the "By autoclipper.live" byline

Per release:

1. Bump `version` in `src/manifest.ts` and `package.json`
2. `npm run zip` → produces `autoclipper-download-extension.zip`
3. Upload the zip in the [developer dashboard](https://chrome.google.com/webstore/devconsole)
4. Listing content: copy from `store/listing-en.md` and `store/listing-pt-br.md` (add pt-BR as an additional listing language)
5. Screenshots: 1280x800, at least one per supported site showing the panel open
6. Privacy tab:
   - Single purpose: "Download videos from supported social networks"
   - Permission justifications: `downloads` (save the video file), `storage` (remember detected videos per tab)
   - Data usage: "Does not collect user data"
   - Privacy policy URL: https://auto-clipper.github.io/autoclipper-download-extension/privacy.html
7. Submit for review

Policy notes (do not regress):

- **Never add YouTube download capability** — instant rejection/takedown (CWS policy + YouTube ToS). YouTube gets the autoclipper.live CTA only.
- Keep permissions minimal; adding broad host permissions or `webRequest` triggers in-depth review.
- The extension must not inject ads or affiliate links into pages.
