import type { MediaItem } from '@/shared/types';
import { walkJson, buildFilename } from '@/shared/walk';
import type { Provider } from './types';

/**
 * TikTok exposes item structs both in the SSR state script tag
 * (`__UNIVERSAL_DATA_FOR_REHYDRATION__`) and in JSON API responses
 * (e.g. /api/item/detail, /api/post/item_list). Both contain objects with
 * `video.playAddr` / `video.downloadAddr` plus `desc` and `id`.
 */
export const tiktok: Provider = {
  id: 'tiktok',
  hosts: ['tiktok.com'],

  extractFromJson(body: string, pageUrl: string): MediaItem[] {
    if (!body.includes('playAddr') && !body.includes('downloadAddr')) return [];

    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      return [];
    }

    const items: MediaItem[] = [];
    const seen = new Set<string>();

    walkJson(parsed, (obj) => {
      const video = obj.video;
      if (!video || typeof video !== 'object') return;
      const url: string | undefined = video.downloadAddr || video.playAddr;
      if (!url || typeof url !== 'string' || seen.has(url)) return;
      seen.add(url);

      const id = obj.id ? String(obj.id) : url.slice(-24);
      const author = obj.author?.uniqueId ?? obj.author?.unique_id;
      const desc = typeof obj.desc === 'string' ? obj.desc : undefined;

      items.push({
        id: `tiktok:${id}`,
        provider: 'tiktok',
        url,
        pageUrl: author ? `https://www.tiktok.com/@${author}/video/${id}` : pageUrl,
        title: desc,
        thumbnail: typeof video.cover === 'string' ? video.cover : undefined,
        quality: video.height ? `${video.height}p` : undefined,
        filename: buildFilename('tiktok', desc, id),
      });
    });

    return items;
  },
};

/**
 * Parse the SSR rehydration JSON embedded in the page. The content script
 * reads the script tag's text and passes it here.
 */
export function extractTikTokFromRehydration(scriptText: string, pageUrl: string): MediaItem[] {
  return tiktok.extractFromJson(scriptText, pageUrl);
}
