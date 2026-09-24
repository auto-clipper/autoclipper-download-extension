import type { MediaItem } from '@/shared/types';

/**
 * Pairs on-page video players with detected media items so the inline
 * download button downloads the right file. Pure (no DOM) — the caller
 * flattens a player's surroundings into "levels" of strings, nearest first:
 *
 *   level 0: the player itself (poster, src, id, attributes)
 *   level n: the n-th ancestor (its id/permalink + hrefs of links inside it)
 *
 * The first level where some item's token shows up wins, so a post's own
 * permalink beats a link to another post further up the tree.
 */

/** Shorter tokens produce false positives (substring hits in unrelated URLs). */
const MIN_TOKEN_LENGTH = 6;

/** Strings that identify an item in the DOM: its media id and post path. */
export function itemTokens(item: MediaItem): string[] {
  const tokens: string[] = [];
  const id = item.id.slice(item.id.indexOf(':') + 1);
  if (id.length >= MIN_TOKEN_LENGTH) tokens.push(id);
  try {
    const path = new URL(item.pageUrl).pathname.replace(/\/+$/, '');
    // Post-like paths only; "/" or "/home" would match every link.
    if (path.split('/').filter(Boolean).length >= 2) tokens.push(path);
  } catch {
    // Unparseable pageUrl: the id token alone has to do.
  }
  return tokens;
}

export function matchItem(levels: string[][], items: MediaItem[]): MediaItem | undefined {
  const candidates = items.map((item) => ({ item, tokens: itemTokens(item) }));
  for (const level of levels) {
    const strings = level.filter(Boolean);
    if (!strings.length) continue;
    const hit = candidates.find(({ tokens }) =>
      tokens.some((token) => strings.some((s) => s.includes(token))),
    );
    if (hit) return hit.item;
  }
  return undefined;
}

/** The item a single-video page (reel, clip, /status/) is about, if any. */
export function itemForLocation(href: string, items: MediaItem[]): MediaItem | undefined {
  return items.find((item) => {
    const id = item.id.slice(item.id.indexOf(':') + 1);
    return id.length >= MIN_TOKEN_LENGTH && href.includes(id);
  });
}

/** Most recent detections kept per tab; long feeds would otherwise grow forever. */
export const MAX_ITEMS = 50;

/**
 * List order for the panel and popup: videos on screen first (most
 * prominent first), then everything else newest first. `detected` is in
 * detection order (oldest first). Keeps at most MAX_ITEMS, dropping the
 * oldest off-screen ones.
 */
export function orderItems(detected: MediaItem[], visibleIds: string[]): MediaItem[] {
  const byId = new Map(detected.map((item) => [item.id, item]));
  const visible = visibleIds.flatMap((id) => byId.get(id) ?? []);
  const rest = detected.filter((item) => !visibleIds.includes(item.id)).reverse();
  return [...visible, ...rest].slice(0, MAX_ITEMS);
}
