// Play smoke test: serve the built client, open it at a phone landscape size in headless Chromium,
// and check the menu, a race, a derby and the results screen render with no page errors.
// Screenshots go to captures/. Run with `pnpm play:smoke` (it builds first).
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';

// Playwright from the workspace or a global install (NODE_PATH); ESM imports ignore NODE_PATH.
const { chromium } = createRequire(import.meta.url)('playwright');

const root = new URL('../packages/client/dist/', import.meta.url).pathname;
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.webmanifest': 'application/manifest+json',
};
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(
    /^(\.\.[/\\])+/,
    '',
  );
  try {
    const file = join(root, path.endsWith('/') ? `${path}index.html` : path);
    const body = await readFile(file);
    res
      .writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' })
      .end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}/`;
await mkdir('captures', { recursive: true });

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
const fail = (msg) => {
  console.error(`play-smoke: ${msg}`);
  process.exitCode = 1;
};

await page.goto(base);
await page.waitForTimeout(600);
await page.screenshot({ path: 'captures/menu.png' });
if ((await page.locator('#venues button').count()) < 3) fail('menu lists fewer than 3 venues');

// the pixel engine (WebGL2) on every venue, and the canvas fallback once
const runs = [
  ['kennel-loop', 'mutt', 'pixel'],
  ['scrapyard-run', 'whippet', 'pixel'],
  ['the-pit', 'bruiser', 'pixel'],
  ['kennel-loop', 'pug', 'canvas'],
];
for (const [venue, car, renderer] of runs) {
  const extra = renderer === 'canvas' ? '&renderer=canvas' : '';
  await page.goto(`${base}?start=${venue}&car=${car}&autoplay&seed=7${extra}`);
  await page.waitForTimeout(6500);
  const got = await page.evaluate(() => window.__dd.renderer);
  if (got !== renderer) fail(`${venue}: wanted the ${renderer} renderer, got ${got}`);
  const name = `${venue}-${renderer}`;
  await page.screenshot({ path: `captures/${name}.png` });
  // run the rest of the race at full speed and check it reaches the results screen
  const end = await page.evaluate(() => {
    const dd = window.__dd;
    const s = dd.session;
    for (let i = 0; i < 60 * 400 && s.world.phase !== 'over'; i++) s.step();
    dd.finish();
    return {
      phase: s.world.phase,
      screen: dd.screen,
      rows: document.querySelectorAll('#resTable tr').length,
    };
  });
  if (end.phase !== 'over' || end.screen !== 'results' || end.rows < 2)
    fail(`${name} did not finish: ${JSON.stringify(end)}`);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `captures/${name}-results.png` });
}

if (errors.length) fail(`page errors:\n  ${errors.join('\n  ')}`);
await browser.close();
server.close();
if (!process.exitCode) console.log('play-smoke: ok (screenshots in captures/)');
