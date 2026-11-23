// Overdraw bench: serve the built client in headless Chromium at a phone landscape size (844x390,
// dpr 2), drive every venue and a heavy test-range scene, and print the overdraw meter's fragments
// per pixel (see packages/client/src/render/pixel/overdraw.ts). Heat maps go to captures/overdraw/.
// Run with `pnpm build && node scripts/overdraw.mjs [venue ...]`. The counts do not depend on the GPU;
// only the screen size, the camera and the scene.
import { createServer } from 'node:http';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');

const root = new URL('../packages/client/dist/', import.meta.url).pathname;
const venueDir = new URL('../packages/content/core/venue/', import.meta.url).pathname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(
    /^(\.\.[/\\])+/,
    '',
  );
  try {
    const file = join(root, path.endsWith('/') ? `${path}index.html` : path);
    res
      .writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' })
      .end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}/`;
const out = 'captures/overdraw';
await mkdir(out, { recursive: true });

const venues = process.argv.slice(2).length
  ? process.argv.slice(2)
  : (await readdir(venueDir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 844, height: 390 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

const KEYS = ['covered', 'solid', 'written', 'front', 'shellSolid', 'shellWritten', 'shellFront', 'particles'];
const rows = [];
const add = (name, list) => {
  const n = list.length;
  const row = { name, slices: 0, visible: 0, avg: {}, max: {} };
  for (const k of KEYS) {
    row.avg[k] = list.reduce((a, s) => a + s.avg[k], 0) / n;
    row.max[k] = Math.max(...list.map((s) => s.max[k]));
  }
  row.visible = list.reduce((a, s) => a + s.visible, 0) / n;
  row.slices = Math.round(list.reduce((a, s) => a + s.slices, 0) / n);
  row.capped = list.some((s) => s.capped);
  rows.push(row);
};
const heat = async (name, ch) => {
  await page.evaluate((c) => window.__dd.overdraw.heat(c), ch);
  await page.evaluate(() => window.__dd.overdraw.measure());
  await page.screenshot({ path: `${out}/${name}-${ch}.png` });
};

for (const v of venues) {
  await page.goto(`${base}?start=${v}&car=mutt&autoplay&seed=7&overdraw`);
  await page.waitForTimeout(6500);
  const list = [];
  for (let k = 0; k < 4; k++) {
    // 12 s of race between samples, at full speed
    const s = await page.evaluate(() => {
      const s = window.__dd.session;
      for (let i = 0; i < 60 * 12 && s.world.phase !== 'over'; i++) s.step();
      return window.__dd.overdraw.measure();
    });
    if (s) list.push(s);
  }
  if (list.length) add(v, list);
  await heat(v, 'written');
  await page.evaluate(() => window.__dd.overdraw.heat(null));
}

// the test range with everything going at once: blasts on the parked cars and around them
await page.goto(`${base}?dev&car=mutt&overdraw`);
await page.waitForTimeout(3000);
const busy = await page.evaluate(() => {
  const dd = window.__dd;
  const s = dd.session;
  const P = s.world.player;
  dd.dev.setRate(0);
  const list = [];
  for (let k = 0; k < 6; k++) {
    for (const c of s.world.cars) if (c !== P) dd.dev.use(c.x + (k % 3) * 6 - 6, c.y, 'blast');
    for (let i = 0; i < 20; i++) s.step();
    const m = dd.overdraw.measure();
    if (m) list.push(m);
  }
  return list;
});
if (busy.length) add('test range, blasts', busy);
await heat('range', 'written');
await heat('range', 'solid');
await heat('range', 'particles');

const f = (x) => x.toFixed(2);
console.log(
  '\nfragments per screen pixel at 1688x780 (844x390 css, dpr 2); avg over samples, worst pixel in brackets\n',
);
console.log(
  '| scene | slices | covered | solid | written | front-to-back | floor | shell solid | shell written | shell front | particles |',
);
console.log('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
for (const r of rows) {
  const c = (k) => `${f(r.avg[k])} (${Math.round(r.max[k])})`;
  console.log(
    `| ${r.name} | ${r.slices} | ${c('covered')} | ${c('solid')} | ${c('written')} | ${c('front')} | ${f(r.visible)} | ${c('shellSolid')} | ${c('shellWritten')} | ${c('shellFront')} | ${c('particles')} |`,
  );
}
if (rows.some((r) => r.capped)) console.log('\n(8-bit counts: capped at 255)');
if (errors.length) console.log(`\npage errors:\n  ${errors.join('\n  ')}`);
await browser.close();
server.close();
