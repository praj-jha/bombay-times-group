// Rasterises the master SVG brand files in public/brand into every PNG/ICO size the site needs.
// Run once (or after editing a brand SVG): node scripts/make-brand.js
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

const dir = path.resolve('public/brand');
const pub = path.resolve('public');
const png = (svg, out, w, h, opts = {}) =>
  sharp(path.join(dir, svg), { density: 600 })
    .resize(w, h, { fit: 'contain', background: opts.bg || { r: 0, g: 0, b: 0, alpha: 0 } })
    .flatten(opts.flatten ? { background: opts.flatten } : false)
    .png({ compressionLevel: 9 })
    .toFile(out);

await png('logo-mark.svg', path.join(pub, 'favicon-32.png'), 32, 32);
await png('logo-mark.svg', path.join(pub, 'favicon-48.png'), 48, 48);
await png('logo-mark.svg', path.join(pub, 'apple-touch-icon.png'), 180, 180, { flatten: '#0a1f38' });
await png('logo-mark.svg', path.join(pub, 'icon-192.png'), 192, 192);
await png('logo-mark.svg', path.join(pub, 'icon-512.png'), 512, 512);
await png('logo-mark-maskable.svg', path.join(pub, 'icon-maskable-512.png'), 512, 512);
await png('logo-mark.svg', path.join(dir, 'logo-square-512.png'), 512, 512);
await png('logo-600x60.svg', path.join(dir, 'logo-600x60.png'), 600, 60, { flatten: '#ffffff' });
await png('logo-horizontal.svg', path.join(dir, 'logo-horizontal.png'), 1000, 120);
await png('logo-wordmark.svg', path.join(dir, 'logo-wordmark.png'), 1200, null);
await sharp(path.join(dir, 'og-default.svg'), { density: 300 }).resize(1200, 630).jpeg({ quality: 88 }).toFile(path.join(pub, 'og-default.jpg'));
await fs.copyFile(path.join(dir, 'logo-mark.svg'), path.join(pub, 'favicon.svg'));

// favicon.ico (PNG-in-ICO container, 32px + 48px)
const sizes = [32, 48];
const bufs = await Promise.all(sizes.map(s => sharp(path.join(dir, 'logo-mark.svg'), { density: 600 }).resize(s, s).png().toBuffer()));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((s, i) => {
  const e = 6 + 16 * i;
  header.writeUInt8(s, e); header.writeUInt8(s, e + 1); header.writeUInt8(0, e + 2); header.writeUInt8(0, e + 3);
  header.writeUInt16LE(1, e + 4); header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(bufs[i].length, e + 8); header.writeUInt32LE(offset, e + 12);
  offset += bufs[i].length;
});
await fs.writeFile(path.join(pub, 'favicon.ico'), Buffer.concat([header, ...bufs]));
console.log('Brand assets generated.');
