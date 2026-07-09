// Regenerates public/icons/*.png from scripts/icon.svg.
// Requires ImageMagick (`magick`) on PATH.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const svg = path.join(root, 'scripts', 'icon.svg');

for (const size of [16, 32, 48, 128]) {
  const out = path.join(root, 'public', 'icons', `icon${size}.png`);
  execFileSync('magick', ['-background', 'none', svg, '-resize', `${size}x${size}`, out]);
  console.log(`icon${size}.png`);
}
