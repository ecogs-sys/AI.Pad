import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { format as icnsFormat } from 'icns-lib';

const ROOT  = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = join(ROOT, 'apps', 'desktop', 'build');
const SOURCE = join(BUILD, 'icon.png');

// Linux: 8 sizes covering every density the FreeDesktop spec uses
const LINUX_SIZES = [16, 32, 48, 64, 128, 256, 512, 1024];
// Windows ICO: standard multi-resolution set
const ICO_SIZES   = [16, 24, 32, 48, 64, 128, 256];
// macOS ICNS: OSType tag → pixel size
const ICNS_TAGS   = { icp4: 16, icp5: 32, icp6: 64, ic07: 128, ic08: 256, ic09: 512, ic10: 1024 };

async function resize(size) {
  return sharp(SOURCE).resize(size, size).png().toBuffer();
}

console.log(`Source: ${SOURCE}\n`);

// ── Linux ─────────────────────────────────────────────────────────────────
const iconsDir = join(BUILD, 'icons');
mkdirSync(iconsDir, { recursive: true });
for (const size of LINUX_SIZES) {
  writeFileSync(join(iconsDir, `${size}x${size}.png`), await resize(size));
  console.log(`  build/icons/${size}x${size}.png`);
}

// ── Windows ───────────────────────────────────────────────────────────────
const icoBufs = await Promise.all(ICO_SIZES.map(resize));
writeFileSync(join(BUILD, 'icon.ico'), await pngToIco(icoBufs));
console.log('  build/icon.ico');

// ── macOS ─────────────────────────────────────────────────────────────────
const icnsImages = Object.fromEntries(
  await Promise.all(
    Object.entries(ICNS_TAGS).map(async ([tag, size]) => [tag, await resize(size)])
  )
);
writeFileSync(join(BUILD, 'icon.icns'), icnsFormat(icnsImages));
console.log('  build/icon.icns');

console.log('\nDone.');
