// Regenerates public/icons/*.png: the AutoClipper compact logo mark
// (scripts/autoclipper-logo.svg, copied from the landing-page repo) on the
// dark brand base with a download badge in the corner.
// Requires ImageMagick (`magick`) on PATH.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = (f) => path.join(root, 'scripts', f);
const tmp = mkdtempSync(path.join(tmpdir(), 'acdl-icons-'));
const magick = (args) => execFileSync('magick', args);

try {
  for (const size of [16, 32, 48, 128]) {
    const out = path.join(root, 'public', 'icons', `icon${size}.png`);
    const base = path.join(tmp, `base${size}.png`);
    const logo = path.join(tmp, `logo${size}.png`);
    const logoSize = Math.round(size * 0.72);
    magick(['-background', 'none', src('icon-base.svg'), '-resize', `${size}x${size}`, base]);
    magick(['-background', 'none', '-density', '300', src('autoclipper-logo.svg'), '-resize', `${logoSize}x${logoSize}`, logo]);

    const args = [base, logo, '-gravity', 'center'];
    // The badge is unreadable at 16px — the bare mark works better there.
    if (size === 16) {
      args.push('-geometry', '+0+0', '-composite');
    } else {
      const badge = path.join(tmp, `badge${size}.png`);
      const badgeSize = Math.round(size * 0.41);
      const off = Math.round(size * 0.015);
      const shift = Math.round(size * 0.045);
      magick(['-background', 'none', src('badge.svg'), '-resize', `${badgeSize}x${badgeSize}`, badge]);
      args.push('-geometry', `-${Math.round(size * 0.03)}-${shift}`, '-composite');
      args.push(badge, '-gravity', 'southeast', '-geometry', `+${off}+${off}`, '-composite');
    }
    args.push(out);
    magick(args);
    console.log(`icon${size}.png`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
