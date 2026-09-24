import { describe, expect, it } from 'vitest';
import type { MediaItem } from '@/shared/types';
import { itemForLocation, itemTokens, matchItem } from '@/content/match';

const item = (id: string, pageUrl: string): MediaItem => ({
  id,
  provider: id.split(':')[0] as MediaItem['provider'],
  url: `https://cdn.example/${id}.mp4`,
  pageUrl,
  filename: 'x.mp4',
});

const tweetA = item('twitter:1812345678900000001', 'https://x.com/home');
const tweetB = item('twitter:1812345678900000002', 'https://x.com/home');
const reel = item('instagram:DAbc123xyz', 'https://www.instagram.com/p/DAbc123xyz/');
const redditPost = item(
  'reddit:packaged1',
  'https://www.reddit.com/r/videos/comments/abc123/funny/',
);

describe('itemTokens', () => {
  it('uses the media id and post-like paths', () => {
    expect(itemTokens(reel)).toEqual(['DAbc123xyz', '/p/DAbc123xyz']);
  });

  it('skips generic paths and short ids', () => {
    expect(itemTokens(tweetA)).toEqual(['1812345678900000001']);
    expect(itemTokens(item('tiktok:123', 'https://www.tiktok.com/'))).toEqual([]);
  });
});

describe('matchItem', () => {
  it('matches an X video by its poster thumbnail', () => {
    const levels = [['https://pbs.twimg.com/ext_tw_video_thumb/1812345678900000002/pu/img/t.jpg']];
    expect(matchItem(levels, [tweetA, tweetB])).toBe(tweetB);
  });

  it('matches a Reddit player by its post permalink attribute', () => {
    const levels = [[''], ['/r/videos/comments/abc123/funny/']];
    expect(matchItem(levels, [tweetA, redditPost])).toBe(redditPost);
  });

  it('prefers the nearest level over links further up the tree', () => {
    const other = item('instagram:ZZother999', 'https://www.instagram.com/p/ZZother999/');
    const levels = [
      [],
      ['https://www.instagram.com/reel/DAbc123xyz/'],
      ['https://www.instagram.com/p/ZZother999/'],
    ];
    expect(matchItem(levels, [other, reel])).toBe(reel);
  });

  it('returns undefined when nothing matches', () => {
    expect(matchItem([['blob:https://x.com/abc']], [tweetA])).toBeUndefined();
  });
});

describe('itemForLocation', () => {
  it('finds the item a single-video page is about', () => {
    expect(itemForLocation('https://www.instagram.com/reels/DAbc123xyz/', [tweetA, reel])).toBe(
      reel,
    );
    expect(itemForLocation('https://www.instagram.com/', [reel])).toBeUndefined();
  });
});
