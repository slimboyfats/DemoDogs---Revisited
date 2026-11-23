// Look captures: serve the built client in headless Chromium at a phone landscape size (844x390,
// dpr 2) and save the same scenes every time, to compare the look before and after a change:
// a race on Knotwood, a blast and its smoke on the test range, and 1:1 crops of each.
// `pnpm build && node scripts/capture-look.mjs [out-dir]` (default captures/look/).
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
const out = process.argv[2] ?? 'captures/look';
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
const shot = async (name) => {
  await page.screenshot({ path: `${out}/${name}.png` });
  // a 1:1 crop of the middle of the screen, device pixels as they are
  await page.screenshot({
    path: `${out}/${name}-crop.png`,
    clip: { x: 422 - 110, y: 195 - 60, width: 220, height: 120 },
    scale: 'device',
  });
};

await page.goto(`${base}?start=knotwood&car=mutt&autoplay&seed=7`);
await page.waitForTimeout(6500);
await page.evaluate(() => {
  const s = window.__dd.session;
  for (let i = 0; i < 60 * 9; i++) s.step();
});
await page.waitForTimeout(300);
await shot('race');

await page.goto(`${base}?dev&car=mutt`);
await page.waitForTimeout(3000);
const stage = (frames) =>
  page.evaluate((n) => {
    const dd = window.__dd;
    const s = dd.session;
    dd.dev.setRate(3);
    document.getElementById('devPanel').style.visibility = 'hidden';
    if (n < 0) {
      const P = s.world.player;
      dd.dev.use(P.x + 30, P.y - 6, 'blast');
      return;
    }
    for (let i = 0; i < n; i++) s.step();
  }, frames);
await stage(-1);
await stage(6);
await page.waitForTimeout(300);
await shot('blast');
await stage(40);
await page.waitForTimeout(300);
await shot('blast-smoke');
await stage(120);
await page.waitForTimeout(300);
await shot('blast-after');

if (errors.length) console.log(`page errors:\n  ${errors.join('\n  ')}`);
await browser.close();
server.close();
