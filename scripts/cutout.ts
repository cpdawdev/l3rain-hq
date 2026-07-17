/**
 * Batch sprite cutout (asset pipeline §1.5): chroma-key removal, trim,
 * resize to 512px height. Wraps ImageMagick (`magick`), which must be on PATH.
 *
 *   pnpm cutout <inputDir> [outputDir] [--chroma=#00FF00] [--fuzz=12]
 *
 * Writes {agent-id}_idle_se.png next to the pipeline contract. For raw images
 * whose background is NOT flat chroma, use rembg instead:
 *   pip install rembg && rembg i raw.png out.png
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function fail(msg: string): never {
  console.error(`cutout: ${msg}`);
  process.exit(1);
}

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flags = new Map(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, v] = a.replace(/^--/, '').split('=');
      return [k ?? '', v ?? 'true'] as const;
    }),
);

const inputDir =
  args[0] ?? fail('usage: pnpm cutout <inputDir> [outputDir] [--chroma=#00FF00] [--fuzz=12]');
const outputDir = args[1] ?? path.join(inputDir, 'cutout');
const chroma = flags.get('chroma') ?? '#00FF00';
const fuzz = flags.get('fuzz') ?? '12';

const magick = spawnSync('magick', ['-version'], { stdio: 'ignore' });
if (magick.error)
  fail(
    'ImageMagick not found on PATH. Install it (brew install imagemagick) or use rembg (see header).',
  );

if (!fs.existsSync(inputDir)) fail(`input dir not found: ${inputDir}`);
fs.mkdirSync(outputDir, { recursive: true });

const files = fs.readdirSync(inputDir).filter((f) => /\.(png|webp|jpg|jpeg)$/i.test(f));
if (files.length === 0) fail(`no images in ${inputDir}`);

for (const file of files) {
  const src = path.join(inputDir, file);
  const out = path.join(outputDir, `${path.parse(file).name.replace(/_raw$/, '')}.png`);
  execFileSync('magick', [
    src,
    '-fuzz',
    `${fuzz}%`,
    '-transparent',
    chroma,
    '-trim',
    '+repage',
    '-resize',
    'x512',
    // clean chroma halo on the alpha edge
    '-channel',
    'A',
    '-morphology',
    'Erode',
    'Disk:1',
    '+channel',
    out,
  ]);
  console.log(`cutout: ${file} -> ${out}`);
}
console.log(`cutout: done (${String(files.length)} sprites) — QA at 200% zoom per pipeline §1.6`);
