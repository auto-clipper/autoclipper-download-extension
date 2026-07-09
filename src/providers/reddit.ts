import type { MediaItem } from '@/shared/types';
import { walkJson, buildFilename } from '@/shared/walk';
import type { Provider } from './types';

/**
 * Reddit hosts video on v.redd.it as DASH: the `fallback_url` is a complete
 * MP4 containing only the video track; audio (when present) lives in a
 * separate `DASH_AUDIO_*.mp4` file next to it. The post's own public JSON
 * (`<permalink>.json`) carries the `reddit_video` descriptor.
 *
 * v1 limitation: we offer video and audio as separate downloads instead of
 * muxing them client-side. See README "Known limitations".
 */
export const reddit: Provider = {
  id: 'reddit',
  hosts: ['reddit.com'],

  extractFromJson(body: string, pageUrl: string): MediaItem[] {
    if (!body.includes('reddit_video')) return [];

    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      return [];
    }

    const items: MediaItem[] = [];
    const seen = new Set<string>();

    walkJson(parsed, (obj) => {
      const rv = obj.secure_media?.reddit_video ?? obj.media?.reddit_video ?? obj.reddit_video;
      if (!rv || typeof rv.fallback_url !== 'string') return;

      const url = rv.fallback_url.replace(/\?.*$/, '');
      if (seen.has(url)) return;
      seen.add(url);

      const idMatch = /v\.redd\.it\/([^/]+)\//.exec(url);
      const id = idMatch?.[1] ?? url.slice(-24);
      const title = typeof obj.title === 'string' ? obj.title : undefined;
      const permalink = typeof obj.permalink === 'string' ? obj.permalink : undefined;

      items.push({
        id: `reddit:${id}`,
        provider: 'reddit',
        url,
        audioUrl: rv.has_audio ? redditAudioUrl(url) : undefined,
        pageUrl: permalink ? `https://www.reddit.com${permalink}` : pageUrl,
        title,
        thumbnail: typeof obj.thumbnail === 'string' && obj.thumbnail.startsWith('http')
          ? obj.thumbnail
          : undefined,
        quality: rv.height ? `${rv.height}p` : undefined,
        filename: buildFilename('reddit', title, id),
      });
    });

    return items;
  },
};

/** Derive the audio track URL from a DASH video fallback URL. */
export function redditAudioUrl(videoUrl: string): string {
  return videoUrl.replace(/DASH_\d+\.mp4.*$/, 'DASH_AUDIO_128.mp4');
}
