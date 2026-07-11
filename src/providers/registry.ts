import type { Provider } from './types';
import { matchesHost } from './types';
import { instagram } from './instagram';
import { tiktok } from './tiktok';
import { twitter } from './twitter';
import { reddit } from './reddit';
import { twitch } from './twitch';

/**
 * Downloadable providers. YouTube is intentionally NOT here: Chrome Web
 * Store policy forbids extensions that download YouTube videos, so YouTube
 * pages get a "clip it with AutoClipper" call-to-action instead
 * (see content/youtube.ts).
 */
export const providers: Provider[] = [instagram, tiktok, twitter, reddit, twitch];

export function providerForHost(hostname: string): Provider | undefined {
  return providers.find((p) => matchesHost(p, hostname));
}
