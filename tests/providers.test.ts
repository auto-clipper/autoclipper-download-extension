import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { instagram } from '@/providers/instagram';
import { tiktok } from '@/providers/tiktok';
import { twitter } from '@/providers/twitter';
import { reddit, redditAudioUrl, extractFromPackagedMedia } from '@/providers/reddit';
import { twitch } from '@/providers/twitch';
import { providerForHost } from '@/providers/registry';
import { sanitizeFilename, buildFilename } from '@/shared/walk';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

describe('instagram', () => {
  it('extracts the best video version from a reel payload', () => {
    const items = instagram.extractFromJson(fixture('instagram-reel.json'), 'https://www.instagram.com/reels/');
    expect(items).toHaveLength(1);
    expect(items[0].url).toContain('reel-hd.mp4');
    expect(items[0].quality).toBe('720p');
    expect(items[0].title).toBe('Como viralizar no Instagram em 2026 🚀');
    expect(items[0].pageUrl).toBe('https://www.instagram.com/p/DAbCdEfGhIj/');
    expect(items[0].thumbnail).toContain('thumb.jpg');
    expect(items[0].filename).toMatch(/^autoclipper\/instagram-.+\.mp4$/);
  });

  it('returns [] for payloads without videos', () => {
    expect(instagram.extractFromJson('{"items":[{"pk":"1"}]}', 'x')).toEqual([]);
    expect(instagram.extractFromJson('not json video_versions', 'x')).toEqual([]);
  });
});

describe('tiktok', () => {
  it('extracts downloadAddr with author, id and cover', () => {
    const items = tiktok.extractFromJson(fixture('tiktok-item-detail.json'), 'https://www.tiktok.com/foryou');
    expect(items).toHaveLength(1);
    expect(items[0].url).toContain('/download/');
    expect(items[0].id).toBe('tiktok:7412345678901234567');
    expect(items[0].pageUrl).toBe('https://www.tiktok.com/@autoclipper.live/video/7412345678901234567');
    expect(items[0].quality).toBe('1024p');
  });
});

describe('twitter', () => {
  it('picks the highest-bitrate mp4 variant', () => {
    const items = twitter.extractFromJson(fixture('twitter-tweet-detail.json'), 'https://x.com/user/status/1');
    expect(items).toHaveLength(1);
    expect(items[0].url).toContain('720x1280/high.mp4');
    expect(items[0].quality).toBe('720p');
    expect(items[0].variants!.map((v) => v.quality)).toEqual(['720p', '320p']);
    expect(items[0].thumbnail).toContain('thumb.jpg');
  });

  it('titles the video with the tweet text and links to the tweet', () => {
    const items = twitter.extractFromJson(fixture('twitter-tweet-detail.json'), 'https://x.com/home');
    expect(items[0].title).toBe('Clipping tip of the day: cut the silence');
    expect(items[0].pageUrl).toBe('https://x.com/autoclipper/status/1812345678901234567');
    expect(items[0].filename).toBe('autoclipper/twitter-Clipping tip of the day cut the silence.mp4');
    expect(items[0].id).toBe('twitter:1812345678900000001');
  });

  it('still extracts media found outside a tweet, untitled', () => {
    const url = 'https://video.twimg.com/tweet_video/1899999999999999999/a.mp4';
    const media = { id_str: '1899999999999999999', video_info: { variants: [{ content_type: 'video/mp4', url }] } };
    const items = twitter.extractFromJson(JSON.stringify({ media }), 'https://x.com/home');
    expect(items).toHaveLength(1);
    expect(items[0].title).toBeUndefined();
    expect(items[0].pageUrl).toBe('https://x.com/home');
  });
});

describe('reddit', () => {
  it('extracts video and derives the separate audio track URL', () => {
    const items = reddit.extractFromJson(fixture('reddit-post.json'), 'https://www.reddit.com/r/funny/');
    expect(items).toHaveLength(1);
    expect(items[0].url).toBe('https://v.redd.it/abc123xyz/DASH_720.mp4');
    expect(items[0].audioUrl).toBe('https://v.redd.it/abc123xyz/DASH_AUDIO_128.mp4');
    expect(items[0].title).toBe('Cat discovers the vacuum cleaner');
    expect(items[0].pageUrl).toContain('/r/funny/comments/1abcde/');
  });

  it('derives audio URLs from DASH and CMAF resolutions', () => {
    expect(redditAudioUrl('https://v.redd.it/x/DASH_1080.mp4')).toBe(
      'https://v.redd.it/x/DASH_AUDIO_128.mp4',
    );
    expect(redditAudioUrl('https://v.redd.it/x/CMAF_1080.mp4')).toBe(
      'https://v.redd.it/x/CMAF_AUDIO_128.mp4',
    );
  });

  it('extracts the best packaged (audio-muxed) MP4 from shreddit player data', () => {
    const item = extractFromPackagedMedia(fixture('reddit-packaged-media.json'), {
      title: 'Mother bird stood her ground',
      permalink: '/r/nextfuckinglevel/comments/1u3dmle/mother_bird/',
      pageUrl: 'https://www.reddit.com/r/nextfuckinglevel/',
    });
    expect(item).not.toBeNull();
    expect(item!.url).toContain('m2-res_1080p.mp4');
    expect(item!.id).toBe('reddit:hse3p7zucq6h1');
    expect(item!.quality).toBe('1080p');
    expect(item!.audioUrl).toBeUndefined();
    expect(item!.pageUrl).toBe(
      'https://www.reddit.com/r/nextfuckinglevel/comments/1u3dmle/mother_bird/',
    );
  });

  it('returns null for malformed packaged media', () => {
    expect(extractFromPackagedMedia('not json', { pageUrl: 'x' })).toBeNull();
    expect(extractFromPackagedMedia('{"playbackMp4s":{"permutations":[]}}', { pageUrl: 'x' })).toBeNull();
  });
});

describe('twitch', () => {
  it('builds authenticated clip URLs from the access-token payload', () => {
    const items = twitch.extractFromJson(
      fixture('twitch-clip-token.json'),
      'https://www.twitch.tv/somechannel/clip/GentleFuriousPanda-abc123',
    );
    expect(items).toHaveLength(1);
    expect(items[0].url).toContain('AT-cm%7C999-1080.mp4?sig=d2b47f4a1c&token=');
    expect(items[0].url).toContain(encodeURIComponent('"forbidden":false'));
    expect(items[0].id).toBe('twitch:GentleFuriousPanda-abc123');
    expect(items[0].quality).toBe('1080p');
    expect(items[0].variants).toHaveLength(3);
    expect(items[0].variants![1].quality).toBe('720p');
  });

  it('returns [] without a playback token', () => {
    expect(twitch.extractFromJson('{"data":{"clip":{"videoQualities":[]}}}', 'x')).toEqual([]);
  });
});

describe('variants', () => {
  it('instagram exposes all video versions as variants', () => {
    const items = instagram.extractFromJson(fixture('instagram-reel.json'), 'x');
    expect(items[0].variants).toHaveLength(2);
    expect(items[0].variants![1].quality).toBe('480p');
  });

  it('reddit packaged media exposes all permutations as variants, best first', () => {
    const item = extractFromPackagedMedia(fixture('reddit-packaged-media.json'), { pageUrl: 'x' });
    expect(item!.variants).toHaveLength(3);
    expect(item!.variants![0].quality).toBe('1080p');
    expect(item!.variants![2].quality).toBe('240p');
  });
});

describe('registry', () => {
  it('maps hostnames to providers', () => {
    expect(providerForHost('www.instagram.com')?.id).toBe('instagram');
    expect(providerForHost('x.com')?.id).toBe('twitter');
    expect(providerForHost('twitter.com')?.id).toBe('twitter');
    expect(providerForHost('old.reddit.com')?.id).toBe('reddit');
    expect(providerForHost('www.twitch.tv')?.id).toBe('twitch');
    expect(providerForHost('clips.twitch.tv')?.id).toBe('twitch');
    expect(providerForHost('www.youtube.com')).toBeUndefined();
    expect(providerForHost('evil-instagram.com.attacker.net')).toBeUndefined();
  });
});

describe('filenames', () => {
  it('sanitizes unsafe characters', () => {
    expect(sanitizeFilename('a/b\\c:d*e?"f<g>h|i#j')).toBe('abcdefghij');
    expect(sanitizeFilename('   ')).toBe('video');
  });

  it('builds provider-prefixed filenames', () => {
    expect(buildFilename('tiktok', 'My video!', '123')).toBe('autoclipper/tiktok-My video.mp4');
    expect(buildFilename('reddit', undefined, 'abc')).toBe('autoclipper/reddit-abc.mp4');
  });
});
