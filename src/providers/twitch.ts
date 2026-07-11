import type { MediaItem } from '@/shared/types';
import { walkJson, buildFilename } from '@/shared/walk';
import type { Provider } from './types';

/**
 * Twitch clip pages request a `VideoAccessToken_Clip` GraphQL operation
 * whose response carries `videoQualities` (direct MP4 `sourceURL`s) plus a
 * `playbackAccessToken` (signature + value). A quality URL is downloadable
 * once `?sig=<signature>&token=<value>` is appended — the same scheme the
 * site's own player uses. Only clips are supported; VODs/streams are HLS.
 */
export const twitch: Provider = {
  id: 'twitch',
  hosts: ['twitch.tv'],

  extractFromJson(body: string, pageUrl: string): MediaItem[] {
    if (!body.includes('videoQualities') || !body.includes('playbackAccessToken')) return [];

    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      return [];
    }

    const items: MediaItem[] = [];
    const seen = new Set<string>();

    walkJson(parsed, (obj) => {
      const qualities = obj.videoQualities;
      const token = obj.playbackAccessToken;
      if (!Array.isArray(qualities) || !token?.signature || typeof token.value !== 'string') {
        return;
      }

      const sorted = qualities
        .filter((q: any) => typeof q?.sourceURL === 'string')
        .sort((a: any, b: any) => (Number(b.quality) || 0) - (Number(a.quality) || 0));
      if (!sorted.length) return;

      const withAuth = (sourceURL: string) =>
        `${sourceURL}?sig=${encodeURIComponent(token.signature)}&token=${encodeURIComponent(token.value)}`;

      const best = sorted[0];
      const url = withAuth(best.sourceURL);
      if (seen.has(best.sourceURL)) return;
      seen.add(best.sourceURL);

      const slug =
        typeof obj.slug === 'string'
          ? obj.slug
          : /\/clip\/([^/?]+)/.exec(pageUrl)?.[1] ?? best.sourceURL.slice(-24);
      const title = typeof obj.title === 'string' ? obj.title : undefined;

      items.push({
        id: `twitch:${slug}`,
        provider: 'twitch',
        url,
        pageUrl,
        title,
        thumbnail: typeof obj.thumbnailURL === 'string' ? obj.thumbnailURL : undefined,
        quality: best.quality ? `${best.quality}p` : undefined,
        variants: sorted.map((q: any) => ({
          url: withAuth(q.sourceURL),
          quality: q.quality ? `${q.quality}p` : undefined,
        })),
        filename: buildFilename('twitch', title, slug),
      });
    });

    return items;
  },
};
