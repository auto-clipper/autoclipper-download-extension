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

/**
 * Derive the audio track URL from a video fallback URL. Reddit serves
 * `DASH_<res>.mp4` (legacy) and `CMAF_<res>.mp4` (2026 rollout); the audio
 * track sits next to it with the same prefix.
 */
export function redditAudioUrl(videoUrl: string): string {
  return videoUrl.replace(/(DASH|CMAF)_\d+\.mp4.*$/, '$1_AUDIO_128.mp4');
}

export interface PackagedMediaMeta {
  title?: string;
  permalink?: string;
  pageUrl: string;
}

/**
 * Extract a media item from a `packaged-media-json` attribute, which
 * shreddit `<shreddit-player>` elements carry both in feeds and on post
 * pages. Its `playbackMp4s.permutations` are complete MP4s with the audio
 * already muxed in — better than the separate-track fallback_url, and the
 * only client-side source available while scrolling a feed.
 */
export function extractFromPackagedMedia(
  attrJson: string,
  meta: PackagedMediaMeta,
): MediaItem | null {
  let parsed: any;
  try {
    parsed = JSON.parse(attrJson);
  } catch {
    return null;
  }
  const permutations = parsed?.playbackMp4s?.permutations;
  if (!Array.isArray(permutations) || permutations.length === 0) return null;

  const sorted = [...permutations]
    .filter((p: any) => typeof p?.source?.url === 'string')
    .sort(
      (a: any, b: any) =>
        (b.source.dimensions?.height ?? 0) - (a.source.dimensions?.height ?? 0),
    );
  const best = sorted[0];
  if (!best) return null;

  const url: string = best.source.url;
  const idMatch = /(?:v|packaged-media)\.redd\.it\/([^/]+)\//.exec(url);
  const id = idMatch?.[1] ?? url.slice(-24);

  return {
    id: `reddit:${id}`,
    provider: 'reddit',
    url,
    pageUrl: meta.permalink ? `https://www.reddit.com${meta.permalink}` : meta.pageUrl,
    title: meta.title,
    quality: best.source.dimensions?.height ? `${best.source.dimensions.height}p` : undefined,
    variants: sorted.map((p: any) => ({
      url: p.source.url,
      quality: p.source.dimensions?.height ? `${p.source.dimensions.height}p` : undefined,
    })),
    filename: buildFilename('reddit', meta.title, id),
  };
}
