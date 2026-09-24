/** Single source of truth for external URLs the UI links to. */

export const APP_URL = 'https://app.autoclipper.live';
export const SITE_URL = 'https://autoclipper.live';

/** Chrome Web Store listing (drives the review prompt). */
export const STORE_ITEM_ID = 'pdjpofbkmgclkjapmohencchmegcaekl';
export const STORE_LISTING_URL = `https://chromewebstore.google.com/detail/${STORE_ITEM_ID}`;
export const STORE_REVIEW_URL = `${STORE_LISTING_URL}/reviews`;

/** Downloads before the popup offers a review prompt. */
export const REVIEW_PROMPT_THRESHOLD = 4;

/** chrome.storage.local flag: show download buttons on video players (default on). */
export const INLINE_BUTTONS_KEY = 'inlineButtons';

/**
 * chrome.storage.local: per-platform floating-button prefs, keyed by
 * provider id ("instagram", "youtube", ...). See FabPrefs.
 */
export const FAB_PREFS_KEY = 'fabPrefs';

export interface FabPref {
  hidden?: boolean;
  /** Distance from the viewport's right/bottom edges, in px (dragged position). */
  right?: number;
  bottom?: number;
}

export type FabPrefs = Record<string, FabPref>;

/**
 * Sources the app's URL import accepts (frontend resolveLibrarySourceAccess:
 * YouTube free; Instagram/Twitch Pro, with an upsell for free users).
 * "Send to AutoClipper" is only offered for these — the app rejects
 * TikTok/X/Reddit links as an unsupported source.
 */
export const APP_IMPORTABLE_PROVIDERS: readonly string[] = ['youtube', 'instagram', 'twitch'];

export const canSendToApp = (provider: string): boolean =>
  APP_IMPORTABLE_PROVIDERS.includes(provider);
