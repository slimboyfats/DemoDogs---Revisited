// Catch-up captures: stage each catch-up item on the test range in headless Chromium (844x390,
// dpr 2) and save stills, and frames for a video when asked.
// `pnpm build && node scripts/capture-catchup.mjs [out-dir] [--frames]` (default captures/catchup/).
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
const args = process.argv.slice(2);
const frames = args.includes('--frames');
const out = args.find((a) => !a.startsWith('--')) ?? 'captures/catchup';
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

/** Open the test range with time stopped and the panel hidden. */
const range = async (query = '') => {
  await page.goto(`${base}?dev&car=mutt${query}`);
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    const dd = window.__dd;
    dd.dev.setRate(3);
    document.getElementById('devPanel').style.visibility = 'hidden';
    // helpers for the scenes below
    dd.put = (i, dx, dy, h = 0, v = 0) => {
      const w = dd.session.world;
      const c = w.cars[i];
      const P = dd.home ?? (dd.home = { x: w.player.x, y: w.player.y });
      Object.assign(c, { x: P.x + dx, y: P.y + dy, h, z: 0, vz: 0, spin: 0 });
      c.vx = Math.cos(h) * v;
      c.vy = Math.sin(h) * v;
      c.vf = v;
    };
    dd.give = (i, id) => {
      const w = dd.session.world;
      dd.dev.pickupSel.value = `pickup.${id}`;
      dd.dev.use(w.cars[i].x, w.cars[i].y, 'give');
    };
  });
};
const step = (n, ctl) =>
  page.evaluate(
    ([n, ctl]) => {
      const s = window.__dd.session;
      if (ctl) s.o.input.read = () => ctl;
      for (let i = 0; i < n; i++) s.step();
    },
    [n, ctl],
  );
const shot = async (name) => {
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${out}/${name}.png` });
};
let reel = 0;
/** Run n ticks; with --frames, save a frame every other tick for the video. */
const roll = async (n, ctl) => {
  if (!frames) return step(n, ctl);
  for (let i = 0; i < n; i += 2) {
    await step(2, ctl);
    await page.waitForTimeout(60);
    await page.screenshot({ path: `${out}/f${String(reel++).padStart(4, '0')}.png`, scale: 'css' });
  }
};
const GO = { steer: 0, throttle: 1, brake: false, boost: false, fire: false };
const IDLE = { steer: 0, throttle: 0, brake: false, boost: false, fire: false };

// 1: three sizes side by side: a Big Dog, the player's own car, and a runt
await range();
await page.evaluate(() => {
  const dd = window.__dd;
  const w = dd.session.world;
  for (const c of w.cars) c.ai = null;
  // clear the range's clutter out of the way of the scenes
  for (const p of w.props) p.alive = false;
  dd.put(0, 0, 0);
  dd.put(1, -50, 2);
  dd.put(2, 40, 2);
  for (let i = 3; i < w.cars.length; i++) dd.put(i, 500, 200 + i * 40);
});
await step(90, IDLE);
await roll(20, IDLE);
await page.evaluate(() => window.__dd.give(0, 'runt-ray'));
await roll(24, IDLE);
await page.evaluate(() => window.__dd.give(1, 'big-dog'));
await roll(50, IDLE);
await shot('sizes');

// 2: the Big Dog drives over the runt
const runOver = async (victim, name) => {
  await page.evaluate((victim) => {
    const dd = window.__dd;
    const w = dd.session.world;
    dd.put(1, -110, -40, 0);
    dd.put(victim, -30, -40, Math.PI / 2);
    const c = w.cars[1];
    // the range's parked cars have no driver: push this one along by hand
    dd.push = () => {
      c.h = 0;
      c.spin = 0;
      c.vx = 105;
      c.vy = 0;
    };
  }, victim);
  for (let i = 0; i < 50; i++) {
    await page.evaluate(() => window.__dd.push());
    await roll(2, IDLE);
    if (i === 36) await shot(name);
  }
  await roll(50, IDLE);
};
await runOver(2, 'squash-runt');

// 3: a second wind
await page.evaluate(() => {
  const dd = window.__dd;
  for (let i = 1; i < dd.session.world.cars.length; i++) dd.put(i, 500, 200 + i * 40);
  dd.put(0, -160, 20, 0, 80);
  dd.give(0, 'second-wind');
});
await roll(50, GO);
await shot('second-wind');
await roll(40, GO);

// 4: a lead collar on the player, clamped on by a rival
await page.evaluate(() => {
  const dd = window.__dd;
  dd.home = null;
  dd.put(0, 0, 0, Math.PI, 60);
  dd.give(1, 'lead-collar');
});
await roll(70, { ...GO, steer: 0.35 });
await shot('lead-collar');
await roll(60, { ...GO, steer: -0.3 });

// 5: by now the runts are back to size: a Big Dog over a car of ordinary size
await page.evaluate(() => {
  const dd = window.__dd;
  dd.home = null;
  dd.put(0, 0, 0, 0);
  dd.put(2, 60, 30, 1);
  dd.put(1, -110, -40, 0);
  dd.give(1, 'big-dog');
});
await roll(30, IDLE);
await runOver(3, 'squash-car');

// 6: bones out of the sky on the rivals in reach
await page.evaluate(() => {
  const dd = window.__dd;
  dd.home = null;
  dd.put(0, 0, 0, 0);
  dd.put(1, -60, -30, 0.4);
  dd.put(2, 55, -25, 2);
  dd.put(3, 30, 45, -1);
  dd.give(0, 'bone-shower');
});
await roll(34, IDLE);
await shot('bones-falling');
await roll(60, IDLE);
await shot('bones-landed');
await roll(30, IDLE);

// 7: a real race, run on until a catch-up item is at work near the player
await page.goto(`${base}?start=kennel-loop&car=mutt&autoplay&seed=7`);
await page.waitForTimeout(6000);
const found = await page.evaluate(() => {
  const s = window.__dd.session;
  const w = s.world;
  for (let i = 0; i < 60 * 150; i++) {
    s.step();
    const P = w.player;
    const near = w.cars.filter(
      (c) => !c.wrecked && Math.hypot(c.x - P.x, c.y - P.y) < 90 && Math.abs(c.size - 1) > 0.4,
    );
    if (near.length && w.phase === 'race') return w.time;
  }
  return -1;
});
if (found > 0) {
  await step(6);
  await shot('race');
} else console.log('no catch-up item came up near the player in this race');

if (errors.length) console.log(`page errors:\n  ${errors.join('\n  ')}`);
await browser.close();
server.close();
