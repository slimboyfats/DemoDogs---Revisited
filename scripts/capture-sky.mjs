// Sky captures: the same race view under every sky, in headless Chromium at a phone landscape size
// (844x390, dpr 2), to look at the lighting, lamps, snow and wet ground side by side.
// `pnpm build && node scripts/capture-sky.mjs [out-dir] [venue] [sky ...]` (default captures/sky/,
// knotwood, every sky plus the flat light from before there was a sky).
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const root = new URL('../packages/client/dist/', import.meta.url).pathname;
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
const out = process.argv[2] ?? 'captures/sky';
const venue = process.argv[3] ?? 'knotwood';
const want = process.argv.slice(4);
const skies = want.length
  ? want
  : ['flat', 'day', 'dusk', 'night', 'rain', 'storm', 'snow', 'snow-night'];
await mkdir(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 844, height: 390 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

const steps = Number(process.env.STEPS ?? 60 * 9);
await page.goto(`${base}?start=${venue}&car=mutt&autoplay&seed=7`);
await page.waitForTimeout(5000);
await page.evaluate((n) => {
  const s = window.__dd.session;
  for (let i = 0; i < n; i++) s.step();
  // headless frames are slow, and slow frames thin the effects: hold them at full
  Object.defineProperty(s.fx, 'quality', { get: () => 1, set() {} });
  // hold the race still so every sky is the same frame, and clear the screen of controls
  s.advance = () => false;
  for (const e of document.querySelectorAll('#overlay, #controls, #pauseBtn, #pauseKey'))
    e.style.visibility = 'hidden';
}, steps);
// wait until every strip on screen has its lighting baked
for (let i = 0; i < 80; i++) {
  await page.waitForTimeout(250);
  if ((await page.evaluate(() => window.__dd.sky.baking)) === 0) break;
}
for (const sky of skies) {
  await page.evaluate((name) => {
    const k = window.__dd.sky;
    k.flat(name === 'flat');
    k.set(name === 'flat' ? 'day' : name, true);
    k.state.snap();
  }, sky);
  for (let i = 0; i < 80; i++) {
    await page.waitForTimeout(250);
    if ((await page.evaluate(() => window.__dd.sky.baking)) === 0) break;
  }
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${venue}-${sky}.png` });
  await page.screenshot({
    path: `${out}/${venue}-${sky}-crop.png`,
    clip: { x: 422 - 110, y: 195 - 60, width: 220, height: 120 },
    scale: 'device',
  });
  console.log(`${out}/${venue}-${sky}.png`);
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
}
await browser.close();
server.close();
