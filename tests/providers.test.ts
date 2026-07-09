import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { instagram } from '@/providers/instagram';
import { tiktok } from '@/providers/tiktok';
import { twitter } from '@/providers/twitter';
import { reddit, redditAudioUrl } from '@/providers/reddit';
import { providerForHost } from '@/providers/registry';
import { sanitizeFilename, buildFilename } from '@/shared/walk';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

describe('instagram', () => {
  it('extracts the best video version from a reel payload', () => {
    const items = instagram.extractFromJson(fixture('instagram-reel.json'), 'https://www.instagram.com/reels/');
    expect(items).toHaveLength(1);
    expect(items[0].url).toContain('reel-hd.mp4');
    expect(items[0].quality).toBe('720x1280');
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
    expect(items[0].quality).toBe('2176kbps');
    expect(items[0].thumbnail).toContain('thumb.jpg');
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

  it('derives audio URLs from any DASH resolution', () => {
    expect(redditAudioUrl('https://v.redd.it/x/DASH_1080.mp4')).toBe(
      'https://v.redd.it/x/DASH_AUDIO_128.mp4',
    );
  });
});

describe('registry', () => {
  it('maps hostnames to providers', () => {
    expect(providerForHost('www.instagram.com')?.id).toBe('instagram');
    expect(providerForHost('x.com')?.id).toBe('twitter');
    expect(providerForHost('twitter.com')?.id).toBe('twitter');
    expect(providerForHost('old.reddit.com')?.id).toBe('reddit');
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
