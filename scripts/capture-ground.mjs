// Ground captures: for each venue, the whole painted ground as one picture (the canvas itself, no
// cars or scenery), a 3x crop of it at the start line, and one race frame at 844x390 dpr 2, to
// compare roads and terrain before and after a change.
// `pnpm build && node scripts/capture-ground.mjs [out-dir] [venue ...] [--maps]` (default
// captures/ground/, every venue; --maps skips the slow race frames).
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
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
const args = process.argv.slice(2);
const mapsOnly = args.includes('--maps');
const rest = args.filter((a) => !a.startsWith('--'));
const out = rest[0] ?? 'captures/ground';
const ALL = [
  'kennel-loop',
  'knotwood',
  'pinewood-sprint',
  'sluice-hollow',
  'splinter-ridge',
  'brickworks',
  'gravel-gulch',
  'scrapyard-run',
  'tumble-heights',
  'frostbite-quarry',
  'sunbake-canyon',
  'the-pit',
  'crumple-yard',
  'rustwater-wharf',
  'tank-farm',
  'tar-flats',
];
const venues = rest.length > 1 ? rest.slice(1) : ALL;
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
const save = async (name, url) =>
  writeFile(`${out}/${name}.png`, Buffer.from(url.split(',')[1], 'base64'));

for (const venue of venues) {
  await page.goto(`${base}?start=${venue}&car=mutt&autoplay&seed=7`);
  await page.waitForFunction(() => window.__dd?.session?.ground, null, { timeout: 60000 });
  const pics = await page.evaluate(() => {
    const s = window.__dd.session;
    const cv = s.ground.cv;
    const T = s.world.track;
    const cx = T ? T.x[0] : cv.width / 2;
    const cy = T ? T.y[0] : cv.height / 2;
    const c = document.createElement('canvas');
    c.width = 900;
    c.height = 540;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(cv, cx - 150, cy - 90, 300, 180, 0, 0, 900, 540);
    return [cv.toDataURL('image/png'), c.toDataURL('image/png')];
  });
  await save(`${venue}-map`, pics[0]);
  await save(`${venue}-close`, pics[1]);
  if (mapsOnly) continue;
  await page.waitForTimeout(5000);
  await page.evaluate(() => {
    const s = window.__dd.session;
    Object.defineProperty(s.fx, 'quality', { get: () => 1, set() {} });
    for (let i = 0; i < 60 * 7; i++) s.step();
    s.advance = () => false;
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/${venue}-race.png` });
}
await browser.close();
server.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`ground captures in ${out}/`);
