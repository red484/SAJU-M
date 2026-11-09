import { readFile, mkdir, writeFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Use the SVG renderer already supplied by the native asset toolchain.
const require = createRequire(import.meta.resolve('@capacitor/assets'));
const sharp = require('sharp');
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = await readFile(join(root, 'assets/ongi.svg'), 'utf8');
const symbol = source.replace(/<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const paper = '#fafaf7';
const version = createHash('sha256').update(source).digest('hex').slice(0, 10);

async function render(path, size, { scale = 0.84, background = true, round = false, blank = false, monochrome = false } = {}) {
  const inset = (64 - 64 * scale) / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64" fill="none">
    ${background ? (round ? `<circle cx="32" cy="32" r="32" fill="${paper}"/>` : `<path fill="${paper}" d="M0 0h64v64H0z"/>`) : ''}
    ${blank ? '' : `<g transform="translate(${inset} ${inset}) scale(${scale})">${monochrome ? symbol.replace(/#[\da-f]{6}/gi, '#ffffff') : symbol}</g>`}
  </svg>`;
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  let image = sharp(Buffer.from(svg));
  if (background && !round) image = image.removeAlpha();
  await (path.endsWith('.webp') ? image.webp({ lossless: true }) : image.png()).toFile(target);
}

await render('resources/logo.png', 1024);
await render('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', 1024);
await render('store-assets/google-play/icon-512.png', 512);
await render('store-assets/app-store/icon-1024.png', 1024);
await render('store-assets/apps-in-toss/icon-600.png', 600);
await render('assets/apple-touch-icon.png', 180);
await render('assets/mark.webp', 256, { scale: 1, background: false });
await render('assets/favicon-32.png', 32, { scale: 1 });
await render('assets/icon-192.png', 192);
await render('assets/icon-512.png', 512);
await render('assets/icon-maskable-512.png', 512, { scale: 0.72 });

// PNG-backed ICO for browsers and clients that request /favicon.ico directly.
const icoImages = await Promise.all([16, 32, 48].map(size =>
  sharp(Buffer.from(source)).resize(size, size).png().toBuffer()));
const icoHeader = Buffer.alloc(6 + icoImages.length * 16);
icoHeader.writeUInt16LE(1, 2);
icoHeader.writeUInt16LE(icoImages.length, 4);
let offset = icoHeader.length;
for (const [i, png] of icoImages.entries()) {
  const at = 6 + i * 16;
  icoHeader[at] = icoHeader[at + 1] = [16, 32, 48][i];
  icoHeader.writeUInt16LE(1, at + 4);
  icoHeader.writeUInt16LE(32, at + 6);
  icoHeader.writeUInt32LE(png.length, at + 8);
  icoHeader.writeUInt32LE(offset, at + 12);
  offset += png.length;
}
await writeFile(join(root, 'assets/favicon.ico'), Buffer.concat([icoHeader, ...icoImages]));
await writeFile(join(root, 'site.webmanifest'), JSON.stringify({
  id: '/', name: '삶의 온기', short_name: '삶의 온기', lang: 'ko',
  start_url: '/', scope: '/', display: 'standalone',
  background_color: paper, theme_color: paper,
  icons: [
    { src: `/assets/icon-192.png?v=${version}`, sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: `/assets/icon-512.png?v=${version}`, sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: `/assets/icon-maskable-512.png?v=${version}`, sizes: '512x512', type: 'image/png', purpose: 'maskable' }
  ]
}, null, 2) + '\n');

for (const [density, factor] of Object.entries({ ldpi: 0.75, mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 })) {
  const dir = `android/app/src/main/res/mipmap-${density}`;
  await render(`${dir}/ic_launcher.png`, 48 * factor);
  await render(`${dir}/ic_launcher_round.png`, 48 * factor, { round: true });
  // Keep the whole symbol inside the adaptive icon's central safe area.
  await render(`${dir}/ic_launcher_foreground.png`, 108 * factor, { scale: 0.60, background: false });
  await render(`${dir}/ic_launcher_background.png`, 108 * factor, { blank: true });
  await render(`android/app/src/main/res/drawable-${density}/ic_stat_ongi.png`, 24 * factor,
    { scale: 1, background: false, monochrome: true });
}

const adaptive = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`;
for (const name of ['ic_launcher', 'ic_launcher_round']) {
  await writeFile(join(root, `android/app/src/main/res/mipmap-anydpi-v26/${name}.xml`), adaptive);
  const themedDir = join(root, 'android/app/src/main/res/mipmap-anydpi-v33');
  await mkdir(themedDir, { recursive: true });
  await writeFile(join(themedDir, `${name}.xml`), adaptive.replace('</adaptive-icon>',
    '    <monochrome android:drawable="@mipmap/ic_launcher_foreground" />\n</adaptive-icon>'));
}

// Keep the launch artwork centered at every existing orientation and density.
async function splash(path) {
  const { width, height } = await sharp(join(root, path)).metadata();
  const size = Math.round(Math.min(width, height) * 0.24);
  const mark = await sharp(Buffer.from(source)).resize(size).png().toBuffer();
  await sharp({ create: { width, height, channels: 3, background: paper } })
    .composite([{ input: mark, gravity: 'centre' }]).png().toFile(join(root, path));
}
const iosSplash = 'ios/App/App/Assets.xcassets/Splash.imageset';
for (const file of await readdir(join(root, iosSplash))) {
  if (file.endsWith('.png')) await splash(`${iosSplash}/${file}`);
}
const androidRes = 'android/app/src/main/res';
for (const dir of await readdir(join(root, androidRes))) {
  if (!dir.startsWith('drawable')) continue;
  const files = await readdir(join(root, androidRes, dir));
  if (files.includes('splash.png')) await splash(`${androidRes}/${dir}/splash.png`);
}

const feature = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">
  <path fill="${paper}" d="M0 0h1024v500H0z"/>
  <g fill="none" transform="translate(92 104) scale(4.5625)">${symbol}</g>
  <text x="445" y="235" font-family="Apple SD Gothic Neo, sans-serif" font-size="61" font-weight="600" fill="#272b28">삶의 온기</text>
  <text x="448" y="291" font-family="Apple SD Gothic Neo, sans-serif" font-size="25" fill="#646d66">지금의 마음을 함께 정리해요</text>
</svg>`;
await sharp(Buffer.from(feature)).jpeg({ quality: 95 }).toFile(join(root, 'store-assets/google-play/feature-graphic-1024x500.jpg'));

// A new symbol must also replace previously cached icons in installed web shortcuts.
const brandPages = ['index.html', 'native/offline.html', 'src/client/app.js', 'src/client/capture.js',
  ...(await readdir(join(root, 'legal'))).filter(file => file.endsWith('.html')).map(file => `legal/${file}`)];
for (const path of brandPages) {
  const file = join(root, path), before = await readFile(file, 'utf8');
  const after = before.replace(/(\/assets\/(?:ongi\.svg|mark\.webp|apple-touch-icon\.png|favicon-32\.png)|\/favicon\.ico)(?:\?v=[a-f0-9]+)?(?=["'])/g,
    `$1?v=${version}`);
  if (after !== before) await writeFile(file, after);
}
console.log('Generated web, iOS, Android, notification, launch and store artwork from assets/ongi.svg.');
