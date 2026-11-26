// Water to judge by: the player drives off the beach on Bonefish Bay into the lagoon, wades along
// its shallows and then out into the dark water, where it goes under, so the surface, the foam
// along the shore, the splash going in and the wake behind a car are all in one clip. Then one
// still of every venue that has water.
// `pnpm water [out-dir] [--seconds=9] [--still] [--clip] [--spots] [--dpr=1] [--only=venue] [--dist=dir]`
// (default captures/water/): frames f0000.png ... for ffmpeg, and stills.
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
// (--dist=dir serves another build instead, an older one to compare with)
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
const out = args.find((a) => !a.startsWith('--')) ?? 'captures/water';
const seconds = Number(flag('seconds') ?? 9);
const still = args.includes('--still');
const only = flag('only');
const dpr = Number(flag('dpr') ?? 2);
// (--deep=2 makes for the dark water after 2 s instead: a clip of the car going under)
const deepAt = Number(flag('deep') ?? 4.6);
await mkdir(out, { recursive: true });

const browser = await chromium.launch();
const errors = [];
const open = async (venue, extra = '') => {
  const page = await browser.newPage({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: dpr,
  });
  page.on('pageerror', (e) => errors.push(`${venue}: ${e}`));
  await page.goto(`${base}?start=${venue}&car=mutt&seed=7${extra}`);
  await page.waitForFunction(() => window.__dd?.session?.world.phase === 'race', null, {
    timeout: 180000,
  });
  await page.evaluate(() => {
    const s = window.__dd.session;
    s.rate = 0;
    Object.defineProperty(s.fx, 'quality', { get: () => 1, set() {} });
    for (const e of document.querySelectorAll('#controls, #pauseBtn, #pauseKey'))
      e.style.visibility = 'hidden';
  });
  return page;
};
const step = (page, n) =>
  page.evaluate((n) => {
    const s = window.__dd.session;
    for (let i = 0; i < n; i++) s.step();
  }, n);

// into the lagoon off the beach: along the pale shallows, wading, then out into the dark water
if (!args.includes('--spots') && (!only || only === 'bonefish-bay')) {
  const page = await open('bonefish-bay');
  await page.evaluate((deepAt) => {
    const s = window.__dd.session;
    const w = s.world;
    const c = w.player;
    const M = s.ground.water;
    // (the top of the lagoon's northern pool, which is at 890, 1530 and 170 px across)
    c.x = 890;
    c.y = 1348;
    c.h = Math.PI / 2;
    c.vx = c.vy = 0;
    const t0 = w.time;
    s.o.input.read = () => {
      const t = w.time - t0;
      // hold a line 26 px in from the shore, then make for the middle of the pool, the deep
      const ahead = M?.depth(c.x + Math.cos(c.h) * 22, c.y + Math.sin(c.h) * 22) ?? 0;
      // (too deep ahead: turn one way; too shallow: the other. That goes round the shore.)
      let steer = (ahead - 26) / 8;
      if (t >= deepAt) {
        const to = Math.atan2(1530 - c.y, 890 - c.x) - c.h;
        steer = Math.atan2(Math.sin(to), Math.cos(to)) * 2;
      }
      return {
        steer: Math.max(-1, Math.min(1, steer)),
        throttle: t < 0.3 ? 0.5 : 1,
        brake: false,
        boost: false,
        fire: false,
      };
    };
  }, deepAt);
  let n = 0;
  const ticks = Math.round(seconds * 60);
  const stills = [0.25, 0.45, 0.62].map((f) => Math.round((ticks * f) / 2) * 2);
  for (let i = 0; i < ticks; i += 2) {
    await step(page, 2);
    await page.waitForTimeout(still ? 10 : 40);
    if (!still)
      await page.screenshot({ path: `${out}/f${String(n++).padStart(4, '0')}.png`, scale: 'css' });
    if (stills.includes(i)) {
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${out}/bonefish-bay-${stills.indexOf(i) + 1}.png` });
    }
  }
  await page.close();
}

// one still of the water on every venue that has some: [venue, x, y]
const SPOTS = [
  ['bonefish-bay', 1010, 1735],
  ['bonefish-bay', 2500, 2330],
  ['castle-growl', 0, 0],
  ['glimmer-grotto', 0, 0],
  ['sluice-hollow', 0, 0],
  ['rustwater-wharf', 1, 1],
];
let shot = 0;
for (const [venue, x, y] of SPOTS) {
  if (args.includes('--clip') || (only && only !== venue)) continue;
  const page = await open(venue);
  await step(page, 120);
  await page.evaluate(
    ([x, y]) => {
      const s = window.__dd.session;
      const w = s.world;
      s.advance = () => false;
      s.follow = false;
      // (no spot given: the middle of the biggest stretch of water the map starts with)
      // (1, 1: the middle of the map)
      let at = x === 1 ? [w.w / 2, w.h / 2] : [x, y];
      if (!x && !y) {
        const wet = w.spills.filter((p) => p.fixed && p.def.quenches);
        const big = wet.sort((a, b) => b.r - a.r)[0];
        if (big) at = [big.x + big.r * 0.5, big.y - big.r * 0.5];
      }
      [s.cam.x, s.cam.y] = at;
    },
    [x, y],
  );
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/${venue}-water-${++shot}.png`, timeout: 240000 });
  await page.close();
}
await browser.close();
server.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`water captures in ${out}/`);
