// RESEARCH HACK: the same moment of the same race under the three cameras.
// `pnpm build && node scripts/capture-view.mjs [out-dir] [venue] [steps] [extra query]`
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
const out = process.argv[2] ?? 'captures/view';
const venue = process.argv[3] ?? 'rustwater-wharf';
const steps = Number(process.argv[4] ?? 540);
const extra = process.argv[5] ?? '';
const only = process.argv[6];
await mkdir(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 844, height: 390 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
page.on('pageerror', (e) => console.log(String(e)));
page.on('console', (m) => m.type() === 'error' && console.log(m.text()));
await page.goto(`${base}?start=${venue}&car=mutt&autoplay&seed=7&bloom=0${extra}`);
await page.waitForTimeout(6500);
await page.evaluate((n) => {
  const s = window.__dd.session;
  for (let i = 0; i < n; i++) s.step();
  window.__ddView.freeze = true;
}, steps);
for (const [i, view] of ['fixed', 'turn', 'chase'].entries()) {
  await page.evaluate((m) => {
    window.__ddView.mode = m;
    if (m) window.__ddScene.setRaised(false);
  }, i);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/${venue}-${view}.png` });
}
await browser.close();
server.close();
