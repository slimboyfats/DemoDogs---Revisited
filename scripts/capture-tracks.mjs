// Track captures: for each venue, the whole map as the game draws it (scenery, raised ground and
// all, at 1600x1000) and race frames at 844x390 dpr 2 with the camera set down at points round the
// road, to compare a track before and after it is rebuilt.
// `pnpm build && node scripts/capture-tracks.mjs [out-dir] [venue ...] [--dist=dir] [--map]
// [--at=0,0.25,0.5,0.75]` (default captures/tracks/, every venue; a spot can be x:y on the map;
// --map shoots only the whole map;
// --dist shoots another build).
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const dist = flag('dist');
const root = dist ? `${dist}/` : new URL('../packages/client/dist/', import.meta.url).pathname;
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
const mapOnly = args.includes('--map');
const rest = args.filter((a) => !a.startsWith('--'));
const out = rest[0] ?? 'captures/tracks';
// a spot is a fraction of the way round, or x:y on the map
const spots = (flag('at') ?? '0,0.25,0.5,0.75').split(',');
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
  'bonefish-bay',
  'cinder-peak',
  'tailspin-funfair',
  'castle-growl',
  'glimmer-grotto',
  'the-pit',
  'crumple-yard',
  'rustwater-wharf',
  'tank-farm',
  'tar-flats',
];
const venues = rest.length > 1 ? rest.slice(1) : ALL;
await mkdir(out, { recursive: true });

const browser = await chromium.launch();
const errors = [];
const open = async (viewport, dpr, venue) => {
  const page = await browser.newPage({ viewport, deviceScaleFactor: dpr, hasTouch: true });
  page.on('pageerror', (e) => errors.push(`${venue}: ${e}`));
  await page.goto(`${base}?start=${venue}&car=mutt&autoplay&seed=7`);
  await page.waitForFunction(() => window.__dd?.session?.ground, null, { timeout: 120000 });
  await page.waitForTimeout(3000);
  // seven seconds of racing, so the field is strung out, then time stops
  await page.evaluate(() => {
    const s = window.__dd.session;
    Object.defineProperty(s.fx, 'quality', { get: () => 1, set() {} });
    for (let i = 0; i < 60 * 7; i++) s.step();
    s.advance = () => false;
    s.follow = false;
    for (const e of document.querySelectorAll('#hud, .hud, #touch, .touch'))
      e.style.visibility = 'hidden';
  });
  return page;
};

for (const venue of venues) {
  // the whole map
  let page = await open({ width: 1600, height: 1000 }, 1, venue);
  await page.evaluate(() => {
    const dd = window.__dd;
    const s = dd.session;
    const w = s.world;
    const v = dd.view();
    // the camera looks down at a slant: a map is shown about 0.7 as tall as it is long
    const k = Math.min(v.w / w.w, v.h / (w.h * 0.72)) * 0.97;
    dd.overview(k);
    for (const id of ['pauseBtn', 'controls'])
      document.getElementById(id)?.style.setProperty('visibility', 'hidden');
    s.cam.x = w.w / 2;
    s.cam.y = w.h / 2;
  });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${out}/${venue}-map.png`, timeout: 240000 });
  await page.close();
  if (mapOnly) continue;
  page = await open({ width: 844, height: 390 }, 2, venue);
  for (let i = 0; i < spots.length; i++) {
    const on = await page.evaluate((spot) => {
      const s = window.__dd.session;
      const w = s.world;
      const T = w.track;
      if (spot.includes(':')) {
        [s.cam.x, s.cam.y] = spot.split(':').map(Number);
        return true;
      }
      const f = Number(spot);
      if (!T && f > 0) return false;
      const k = T ? Math.floor(f * T.n) % T.n : 0;
      s.cam.x = T ? T.x[k] : w.w / 2;
      s.cam.y = T ? T.y[k] : w.h / 2;
      return true;
    }, spots[i]);
    if (!on) break;
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${out}/${venue}-${i + 1}.png`, timeout: 240000 });
  }
  await page.close();
}
await browser.close();
server.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`track captures in ${out}/`);
