import type { MediaItem } from '@/shared/types';
import { walkJson, buildFilename } from '@/shared/walk';
import { qualityFromUrl } from '@/shared/labels';
import type { Provider } from './types';

/**
 * X/Twitter GraphQL payloads (TweetDetail, HomeTimeline, ...) describe videos
 * as `video_info: { variants: [{ bitrate, content_type, url }] }` inside
 * `extended_entities.media`. We pick the highest-bitrate MP4 variant.
 *
 * The media objects carry no text, so the tweet around them is read first:
 * a tweet result (`{ rest_id, core.user_results, legacy }`) gives the text,
 * author and permalink. Media found outside a tweet still get extracted,
 * just without a title.
 */

interface TweetContext {
  text?: string;
  permalink?: string;
}

/** Tweet text as a title: first line, without trailing t.co media links. */
function tweetTitle(fullText: unknown): string | undefined {
  if (typeof fullText !== 'string') return undefined;
  const line = fullText
    .replace(/https:\/\/t\.co\/\S+/g, '')
    .split('\n')
    .map((l) => l.trim())
    .find(Boolean);
  return line || undefined;
}

function screenName(tweetResult: Record<string, any>): string | undefined {
  const user = tweetResult.core?.user_results?.result;
  const name = user?.legacy?.screen_name ?? user?.core?.screen_name;
  return typeof name === 'string' ? name : undefined;
}

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

    const addMedia = (media: Record<string, any>, context: TweetContext) => {
      const info = media.video_info;
      if (!info || !Array.isArray(info.variants)) return;

      const mp4s = info.variants
        .filter((v: any) => v?.content_type === 'video/mp4' && typeof v.url === 'string')
        .sort((a: any, b: any) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
      const best = mp4s[0];
      if (!best || seen.has(best.url)) return;
      seen.add(best.url);
      const label = (v: any) =>
        qualityFromUrl(v.url) ?? (v.bitrate ? `${Math.round(v.bitrate / 1000)}kbps` : undefined);

      const idMatch = /\/(?:amplify_video|ext_tw_video|tweet_video)\/(\d+)\//.exec(best.url);
      const id = media.id_str ?? idMatch?.[1] ?? best.url.slice(-24);
      const thumbnail =
        typeof media.media_url_https === 'string' ? media.media_url_https : undefined;

      items.push({
        id: `twitter:${id}`,
        provider: 'twitter',
        url: best.url,
        pageUrl: context.permalink ?? pageUrl,
        title: context.text,
        thumbnail,
        quality: label(best),
        variants: mp4s.map((v: any) => ({ url: v.url, quality: label(v) })),
        filename: buildFilename('twitter', context.text, String(id)),
      });
    };

    // walkJson visits parents before children, so tweet-level context wins
    // and the bare-media pass below only picks up what it missed.
    walkJson(parsed, (obj) => {
      const legacy = obj.legacy;
      const media = legacy?.extended_entities?.media;
      if (!Array.isArray(media)) return;
      const author = screenName(obj);
      const tweetId = legacy.id_str ?? obj.rest_id;
      const context: TweetContext = {
        text: tweetTitle(legacy.full_text),
        permalink: author && tweetId ? `https://x.com/${author}/status/${tweetId}` : undefined,
      };
      for (const m of media) if (m && typeof m === 'object') addMedia(m, context);
    });
    walkJson(parsed, (obj) => {
      const media = obj.extended_entities?.media;
      if (!Array.isArray(media)) return;
      const context: TweetContext = { text: tweetTitle(obj.full_text) };
      for (const m of media) if (m && typeof m === 'object') addMedia(m, context);
    });
    walkJson(parsed, (obj) => addMedia(obj, {}));

    return items;
  },
};
