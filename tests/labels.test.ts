import { describe, expect, it } from 'vitest';
import { failureReasonKey, providerName, qualityFromSize, qualityFromUrl } from '@/shared/labels';

describe('labels', () => {
  it('names providers for humans', () => {
    expect(providerName('twitter')).toBe('X');
    expect(providerName('tiktok')).toBe('TikTok');
    expect(providerName(undefined)).toBe('');
  });

  it('formats quality by the short side of the frame', () => {
    expect(qualityFromSize(720, 1280)).toBe('720p');
    expect(qualityFromSize(1920, 1080)).toBe('1080p');
    expect(qualityFromSize(undefined, 720)).toBeUndefined();
    expect(qualityFromUrl('https://video.twimg.com/x/vid/avc1/720x1280/a.mp4')).toBe('720p');
    expect(qualityFromUrl('https://video.twimg.com/x/a.mp4')).toBeUndefined();
  });

  it('maps download interrupt reasons to a user-facing explanation', () => {
    expect(failureReasonKey('SERVER_FORBIDDEN')).toBe('errorLinkExpired');
    expect(failureReasonKey('NETWORK_FAILED')).toBe('errorLinkExpired');
    expect(failureReasonKey('FILE_NO_SPACE')).toBe('errorFile');
    expect(failureReasonKey('Error: Invalid URL')).toBe('errorGeneric');
    expect(failureReasonKey(undefined)).toBe('errorGeneric');
  });
});
