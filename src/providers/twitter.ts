import type { MediaItem } from '@/shared/types';
import { walkJson, buildFilename } from '@/shared/walk';
import type { Provider } from './types';

/**
 * X/Twitter GraphQL payloads (TweetDetail, HomeTimeline, ...) describe videos
 * as `video_info: { variants: [{ bitrate, content_type, url }] }` inside
 * `extended_entities.media`. We pick the highest-bitrate MP4 variant.
 */
export const twitter: Provider = {
  id: 'twitter',
  hosts: ['twitter.com', 'x.com'],

  extractFromJson(body: string, pageUrl: string): MediaItem[] {
    if (!body.includes('video_info')) return [];

    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      return [];
    }

    const items: MediaItem[] = [];
    const seen = new Set<string>();

    walkJson(parsed, (obj) => {
      const info = obj.video_info;
      if (!info || !Array.isArray(info.variants)) return;

      const mp4s = info.variants
        .filter((v: any) => v?.content_type === 'video/mp4' && typeof v.url === 'string')
        .sort((a: any, b: any) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
      const best = mp4s[0];
      if (!best || seen.has(best.url)) return;
      seen.add(best.url);
      const variants = mp4s.map((v: any) => ({
        url: v.url,
        quality: /\/(\d+x\d+)\//.exec(v.url)?.[1] ?? (v.bitrate ? `${Math.round(v.bitrate / 1000)}kbps` : undefined),
      }));

      const idMatch = /\/(?:amplify_video|ext_tw_video|tweet_video)\/(\d+)\//.exec(best.url);
      const id = obj.id_str ?? idMatch?.[1] ?? best.url.slice(-24);
      const thumbnail = typeof obj.media_url_https === 'string' ? obj.media_url_https : undefined;

      items.push({
        id: `twitter:${id}`,
        provider: 'twitter',
        url: best.url,
        pageUrl,
        thumbnail,
        quality: best.bitrate ? `${Math.round(best.bitrate / 1000)}kbps` : undefined,
        variants,
        filename: buildFilename('twitter', undefined, String(id)),
      });
    });

    return items;
  },
};
