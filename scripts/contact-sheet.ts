/**
 * Contact sheet for style-drift QA (asset pipeline §1.6): composes all current
 * character sprites into one grid at equal height. Wraps ImageMagick `montage`.
 *
 *   pnpm contact-sheet [spriteDir] [outFile]
 *
 * Defaults: assets/characters (full-body sprites) if it has images, otherwise
 * assets/characters-portraits (interim portraits). Output: contact-sheet.png.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function fail(msg: string): never {
  console.error(`contact-sheet: ${msg}`);
  process.exit(1);
}

const magick = spawnSync('magick', ['-version'], { stdio: 'ignore' });
if (magick.error) fail('ImageMagick not found on PATH. Install it (brew install imagemagick).');

const root = path.resolve(import.meta.dirname, '..');
const candidates = [
  path.join(root, 'assets/characters'),
  path.join(root, 'assets/characters-portraits'),
];

const spriteDir =
  process.argv[2] ??
  candidates.find((d) => fs.existsSync(d) && fs.readdirSync(d).some((f) => f.endsWith('.png'))) ??
  fail('no sprite directory found (assets/characters or assets/characters-portraits)');

const outFile = process.argv[3] ?? path.join(root, 'contact-sheet.png');

const files = fs
  .readdirSync(spriteDir)
  .filter((f) => f.endsWith('.png'))
  .sort()
  .map((f) => path.join(spriteDir, f));
if (files.length === 0) fail(`no .png sprites in ${spriteDir}`);

execFileSync('magick', [
  'montage',
  ...files,
  '-tile',
  '6x',
  '-geometry',
  'x256+8+8', // equal height, generous gutter
  '-background',
  '#0b1226',
  '-fill',
  '#cbd5e1',
  '-label',
  '%t',
  outFile,
]);
console.log(`contact-sheet: ${String(files.length)} sprites -> ${outFile}`);
console.log('contact-sheet: compare head-to-body ratio + line weight side by side (pipeline §1.6)');
