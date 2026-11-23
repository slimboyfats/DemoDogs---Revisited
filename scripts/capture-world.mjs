// World modifier captures: the same race under each modifier, in headless Chromium at a phone
// landscape size (844x390, dpr 2), one shot each in captures/world/ (or the folder named).
// `pnpm build && node scripts/capture-world.mjs [out-dir] [modifier ...]`
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
const out = process.argv[2] ?? 'captures/world';
await mkdir(out, { recursive: true });

// each modifier: the venue it shows best on, and how many seconds into the race to look
const ALL = {
  downpour: ['kennel-loop', 14],
  gale: ['knotwood', 12],
  thunderheads: ['pinewood-sprint', 16],
  'lights-out': ['kennel-loop', 10],
  'moon-bounce': ['gravel-gulch', 12],
  tremors: ['brickworks', 18],
  'high-water': ['kennel-loop', 60],
  scrapfall: ['scrapyard-run', 14],
  greased: ['kennel-loop', 9],
  tinderbox: ['pinewood-sprint', 30],
};
const names = process.argv.length > 3 ? process.argv.slice(3) : Object.keys(ALL);

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 844, height: 390 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
for (const name of names) {
  const [venue, secs] = ALL[name] ?? ['kennel-loop', 12];
  await page.goto(`${base}?start=${venue}&car=mutt&autoplay&seed=7&mods=${name}`);
  await page.waitForFunction(() => window.__dd?.screen === 'game', null, { timeout: 120000 });
  await page.evaluate((n) => {
    const s = window.__dd.session;
    for (let i = 0; i < n; i++) s.step();
  }, 60 * secs);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log(name, await page.evaluate(() => window.__dd.session.world.mods.map((m) => m.def.id)));
}
await browser.close();
server.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
