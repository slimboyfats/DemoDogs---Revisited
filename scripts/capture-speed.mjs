// What slows a car, and the speedometer that says so: drive the player along real tracks in
// headless Chromium (844x390, dpr 2), on the road, off it, up a hill, on a mud road and damaged,
// and save stills, and frames for a video when asked.
// `pnpm build && node scripts/capture-speed.mjs [out-dir] [--frames] [--dpr=1] [--only=scene]
// [--dist=dir]`
// (default captures/speed/). Scenes: road, rough, hill, mud, hurt. Prints the speed each one settles at.
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
// (--dist=dir serves another build instead, an older one to compare with)
const dist = process.argv.find((a) => a.startsWith('--dist='))?.slice(7);
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
const args = process.argv.slice(2);
const frames = args.includes('--frames');
const only = args.find((a) => a.startsWith('--only='))?.slice(7);
const out = args.find((a) => !a.startsWith('--')) ?? 'captures/speed';
await mkdir(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 844, height: 390 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: Number(args.find((a) => a.startsWith('--dpr='))?.slice(6) ?? 2),
});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

/** Into a race on `venue` with the clock stopped, the rivals parked and a steering helper. */
const race = async (venue) => {
  await page.goto(`${base}?start=${venue}&car=mutt&seed=7`);
  await page.waitForFunction(() => window.__dd?.session?.world.phase === 'race', null, {
    timeout: 180000,
  });
  await page.evaluate(() => {
    const dd = window.__dd;
    const s = dd.session;
    const w = s.world;
    const T = w.track;
    s.rate = 0;
    s.fx.quality = 1;
    w.critters.length = 0;
    // the rivals parked off to the side, out of the way
    w.cars.forEach((c, n) => {
      if (c === w.player) return;
      Object.assign(c, { ai: null, x: 40 + n * 30, y: 40, vx: 0, vy: 0 });
    });
    dd.side = 0;
    // steer for a point ahead on the road, `dd.side` px to its left (negative: right)
    dd.steer = () => {
      const c = w.player;
      const k = (c.idx + 10) % T.n;
      const a = T.a[k];
      const tx = T.x[k] - Math.sin(a) * dd.side;
      const ty = T.y[k] + Math.cos(a) * dd.side;
      const want = Math.atan2(ty - c.y, tx - c.x) - c.h;
      return Math.max(-1, Math.min(1, Math.atan2(Math.sin(want), Math.cos(want)) * 2.5));
    };
    dd.stage = (k, v) => {
      const c = w.player;
      const a = T.a[k];
      Object.assign(c, { x: T.x[k], y: T.y[k], idx: k, h: a, z: 0, vz: 0, spin: 0 });
      c.vx = Math.cos(a) * v;
      c.vy = Math.sin(a) * v;
      c.vf = v;
      Object.assign(s.cam, { x: c.x, y: c.y });
      // nothing in the way for a stretch ahead
      for (const p of w.props) p.alive = false;
    };
    s.o.input.read = () => ({
      steer: dd.steer(),
      throttle: 1,
      brake: false,
      boost: false,
      fire: false,
    });
  });
};
let reel = 0;
const step = (n) =>
  page.evaluate((n) => {
    const s = window.__dd.session;
    for (let i = 0; i < n; i++) s.step();
    const c = s.world.player;
    return { v: Math.round(Math.hypot(c.vx, c.vy)), held: c.held };
  }, n);
/** Run n ticks, drawing as it goes; with --frames, save a frame every other tick. */
const roll = async (n) => {
  let r;
  for (let i = 0; i < n; i += 2) {
    r = await step(2);
    if (frames) {
      await page.waitForTimeout(40);
      await page.screenshot({
        path: `${out}/f${String(reel++).padStart(4, '0')}.png`,
        scale: 'css',
      });
    } else await page.waitForTimeout(20);
  }
  return r;
};
const shot = async (name) => {
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${out}/${name}.png` });
};
const scene = (name) => !only || only === name;
const report = [];

if (scene('road') || scene('rough')) {
  await race('kennel-loop');
  await page.evaluate(() => window.__dd.stage(20, 60));
  const road = await roll(200);
  await shot('road');
  report.push(['road', road]);
  if (scene('rough')) {
    // over the edge onto the grass, and along it
    await page.evaluate(() => (window.__dd.side = window.__dd.session.world.road / 2 + 50));
    const rough = await roll(220);
    await shot('rough');
    report.push(['rough', rough]);
    await page.evaluate(() => (window.__dd.side = 0));
    report.push(['back on the road', await roll(160)]);
  }
}

if (scene('hill')) {
  await race('pinewood-sprint');
  // the steepest climb on the road, and a run up to it
  const k = await page.evaluate(() => {
    const w = window.__dd.session.world;
    const T = w.track;
    const R = w.relief;
    let best = 0;
    let at = 0;
    for (let i = 0; i < T.n; i++) {
      let up = 0;
      for (let j = 0; j < 30; j++) {
        const q = (i + j) % T.n;
        up += R.dx(T.x[q], T.y[q]) * Math.cos(T.a[q]) + R.dy(T.x[q], T.y[q]) * Math.sin(T.a[q]);
      }
      if (up > best) [best, at] = [up, i];
    }
    return (at - 70 + T.n) % T.n;
  });
  await page.evaluate((k) => window.__dd.stage(k, 120), k);
  const hill = await roll(150);
  await shot('hill');
  report.push(['hill', hill]);
}

if (scene('mud')) {
  await race('gravel-gulch');
  const k = await page.evaluate(() => {
    const w = window.__dd.session.world;
    const i = w.roadSurface.findIndex((m) => m && m.id === 'material.mud');
    return (i - 12 + w.track.n) % w.track.n;
  });
  await page.evaluate((k) => window.__dd.stage(k, 120), k);
  const mud = await roll(100);
  await shot('mud');
  report.push(['mud road', mud]);
}

if (scene('hurt')) {
  await race('kennel-loop');
  await page.evaluate(() => {
    window.__dd.session.world.player.hp = 22;
    window.__dd.stage(20, 60);
  });
  const hurt = await roll(200);
  await shot('hurt');
  report.push(['damaged', hurt]);
}

for (const [name, r] of report) console.log(`${name.padEnd(18)} ${r.v} px/s  held ${r.held}`);
if (errors.length) console.error(`page errors:\n  ${errors.join('\n  ')}`);
await browser.close();
server.close();
