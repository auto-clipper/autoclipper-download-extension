import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { muxVideoAndAudio } from '@/lib/mux';

const fixture = (name: string) =>
  path.join(path.dirname(new URL(import.meta.url).pathname), 'fixtures', name);

const toArrayBuffer = (buf: Buffer): ArrayBuffer =>
  buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;

const hasFfprobe = (() => {
  try {
    execFileSync('ffprobe', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe('muxVideoAndAudio', () => {
  it('merges real v.redd.it DASH tracks into one playable MP4', async () => {
    const muxed = await muxVideoAndAudio(
      toArrayBuffer(readFileSync(fixture('dash-video-2s.mp4'))),
      toArrayBuffer(readFileSync(fixture('dash-audio-2s.mp4'))),
    );
    expect(muxed.byteLength).toBeGreaterThan(100_000);

    if (!hasFfprobe) return; // structural assertion only where ffmpeg is absent

    const dir = mkdtempSync(path.join(tmpdir(), 'acdl-mux-'));
    const outPath = path.join(dir, 'muxed.mp4');
    try {
      writeFileSync(outPath, Buffer.from(muxed));
      const probe = execFileSync(
        'ffprobe',
        ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', outPath],
        { encoding: 'utf8' },
      );
      const streams = probe.trim().split('\n').sort();
      expect(streams).toEqual(['audio', 'video']);
      // Full decode: catches corrupt samples that a header probe would miss.
      execFileSync('ffmpeg', ['-v', 'error', '-i', outPath, '-f', 'null', '-'], {
        stdio: 'ignore',
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws on garbage input', async () => {
    const garbage = new Uint8Array(64).buffer;
    await expect(muxVideoAndAudio(garbage, garbage)).rejects.toThrow();
  });

  it('has the fixtures it needs', () => {
    expect(existsSync(fixture('dash-video-2s.mp4'))).toBe(true);
    expect(existsSync(fixture('dash-audio-2s.mp4'))).toBe(true);
  });
});
