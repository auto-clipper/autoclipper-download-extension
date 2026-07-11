import type { MediaItem, MediaVariant } from '@/shared/types';
import { walkJson, buildFilename } from '@/shared/walk';
import type { Provider } from './types';

/**
 * Instagram embeds direct MP4 URLs in its GraphQL/REST payloads as
 * `video_versions: [{ url, width, height }]` (reels, feed, stories) or as
 * `video_url` on older GraphQL media nodes. The <video> elements on the page
 * only expose useless blob: URLs, so interception is the reliable path.
 */
export const instagram: Provider = {
  id: 'instagram',
  hosts: ['instagram.com'],

  extractFromJson(body: string, pageUrl: string): MediaItem[] {
    if (!body.includes('video_versions') && !body.includes('video_url')) return [];

    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      return [];
    }

    const items: MediaItem[] = [];
    const seen = new Set<string>();

    walkJson(parsed, (obj) => {
      const versions = obj.video_versions;
      let url: string | undefined;
      let width: number | undefined;
      let height: number | undefined;
      let variants: MediaVariant[] | undefined;

      if (Array.isArray(versions) && versions[0]?.url) {
        url = String(versions[0].url);
        width = versions[0].width;
        height = versions[0].height;
        variants = versions
          .filter((v: any) => typeof v?.url === 'string')
          .map((v: any) => ({
            url: v.url,
            quality: v.width && v.height ? `${v.width}x${v.height}` : undefined,
          }));
      } else if (typeof obj.video_url === 'string' && obj.is_video) {
        url = obj.video_url;
      }
      if (!url || seen.has(url)) return;
      seen.add(url);

      const code = typeof obj.code === 'string' ? obj.code : undefined;
      const id = code ?? (obj.pk ? String(obj.pk) : obj.id ? String(obj.id) : url.slice(-24));
      const caption =
        typeof obj.caption?.text === 'string'
          ? obj.caption.text
          : typeof obj.caption === 'string'
            ? obj.caption
            : undefined;
      const thumbnail = obj.image_versions2?.candidates?.[0]?.url ?? obj.display_url;

      items.push({
        id: `instagram:${id}`,
        provider: 'instagram',
        url,
        pageUrl: code ? `https://www.instagram.com/p/${code}/` : pageUrl,
        title: caption?.split('\n')[0],
        thumbnail: typeof thumbnail === 'string' ? thumbnail : undefined,
        quality: width && height ? `${width}x${height}` : undefined,
        variants,
        filename: buildFilename('instagram', caption?.split('\n')[0], id),
      });
    });

    return items;
  },
};
