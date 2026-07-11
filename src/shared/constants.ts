/** Single source of truth for external URLs the UI links to. */

export const APP_URL = 'https://app.autoclipper.live';
export const SITE_URL = 'https://autoclipper.live';

/**
 * Chrome Web Store listing. Placeholder until the extension is published —
 * update the id here (and the review prompt starts linking to the real
 * listing). See store/publishing-checklist.md.
 */
export const STORE_ITEM_ID = 'REPLACE_WITH_STORE_ID';
export const STORE_LISTING_URL = `https://chromewebstore.google.com/detail/${STORE_ITEM_ID}`;
export const STORE_REVIEW_URL = `${STORE_LISTING_URL}/reviews`;

/** Downloads before the popup offers a review prompt. */
export const REVIEW_PROMPT_THRESHOLD = 4;
