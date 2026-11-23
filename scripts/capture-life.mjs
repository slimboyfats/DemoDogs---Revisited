// Track-piece captures: stage the boost tiles, ramps, animals and new props on the test range
// in headless Chromium (844x390, dpr 2) and save stills, and frames for a video when asked.
// `pnpm build && node scripts/capture-life.mjs [out-dir] [--only=scene] [--venues=a,b] [--frames]
// [--dpr=1]` (default captures/life/). Scenes: pieces, boost, jump, animals, corn, race.
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
const only = args.find((a) => a.startsWith('--only='))?.slice(7);
const out = args.find((a) => !a.startsWith('--')) ?? 'captures/life';
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

/** Open the test range with time stopped, the panel hidden and the ground cleared. */
const range = async (query = '') => {
  await page.goto(`${base}?dev&car=mutt${query}`);
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    const dd = window.__dd;
    dd.dev.setRate(3);
    dd.session.fx.quality = 1;
    document.getElementById('devPanel').style.visibility = 'hidden';
    const w = dd.session.world;
    for (const c of w.cars) c.ai = null;
    for (const p of w.props) p.alive = false;
    const P = (dd.home = { x: w.player.x, y: w.player.y });
    // and the range's own trees and rocks out of the way of the scene
    for (const s of w.statics)
      if (Math.hypot(s.x - P.x, s.y - P.y) < 300 && s.def.radius < 8) s.down = true;
    w.critters.length = 0;
    dd.put = (i, dx, dy, h = 0, v = 0) => {
      const c = w.cars[i];
      Object.assign(c, { x: P.x + dx, y: P.y + dy, h, z: 0, vz: 0, spin: 0 });
      c.vx = Math.cos(h) * v;
      c.vy = Math.sin(h) * v;
      c.vf = v;
    };
    // a prop at (dx, dy) from home, turned rot
    dd.lay = (id, dx, dy, rot = 0) => {
      const n = w.statics.length;
      dd.dev.propSel.value = `prop.${id}`;
      dd.dev.use(P.x + dx, P.y + dy, 'prop');
      if (w.statics.length > n) w.statics[n].rot = rot;
    };
    for (let i = 1; i < w.cars.length; i++) dd.put(i, 600, 300 + i * 40);
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
  if (!frames) {
    // fire and smoke only move in frames that are drawn
    for (let i = 0; i < n; i += 4) {
      await step(Math.min(4, n - i), ctl);
      await page.waitForTimeout(30);
    }
    return;
  }
  for (let i = 0; i < n; i += 2) {
    await step(2, ctl);
    await page.waitForTimeout(60);
    await page.screenshot({ path: `${out}/f${String(reel++).padStart(4, '0')}.png`, scale: 'css' });
  }
};
const GO = { steer: 0, throttle: 1, brake: false, boost: false, fire: false };
const IDLE = { steer: 0, throttle: 0, brake: false, boost: false, fire: false };
const scene = (name) => !only || only === name;

// 1: everything new, laid out to look at
if (scene('pieces')) {
  await range();
  await page.evaluate(() => {
    const dd = window.__dd;
    const w = dd.session.world;
    // the camera sits on the player's car, so everything is laid out round it
    dd.put(0, 0, 2, 0);
    const at = (x) => x;
    [
      ['boost-pad', -150],
      ['turbo-pad', -119],
      ['ramp', -88],
      ['big-ramp', -56],
      ['chevron-sign', -28],
      ['flag', -14],
      ['grandstand', 8],
      ['grandstand', 23],
      ['scarecrow', 42],
      ['snowman', 55],
    ].forEach(([id, x]) =>
      dd.lay(id, at(x), -58, id === 'scarecrow' ? 1.57 : id === 'snowman' ? 1.2 : 0),
    );
    for (let k = 0; k < 4; k++) dd.lay('hay-wall', at(72), -70 + k * 8);
    ['hay-bale', 'pumpkin', 'tumbleweed'].forEach((id, k) => {
      dd.lay(id, at(92 + k * 22), -62);
      dd.lay(id, at(99 + k * 22), -54);
    });
    ['flowers', 'tall-grass', 'corn', 'mushrooms'].forEach((id, k) => {
      for (let i = 0; i < 5; i++)
        for (let j = 0; j < 3; j++) dd.lay(id, at(-152 + k * 38 + i * 6), -24 + j * 6);
    });
    ['chickens', 'penguins', 'rabbits', 'crows', 'sheep', 'cow', 'deer', 'gulls'].forEach((id, k) =>
      dd.lay(id, at(-140 + (k % 4) * 52), 26 + Math.floor(k / 4) * 32),
    );
    // stood still to be looked at
    for (const k of w.critters) k.t = 99;
  });
  await roll(30, IDLE);
  await shot('pieces');
}

// 2: a boost tile, then a turbo tile
if (scene('boost')) {
  await range();
  await page.evaluate(() => {
    const dd = window.__dd;
    dd.put(0, -170, 0, 0, 120);
    dd.lay('boost-pad', -90, 0);
    dd.lay('turbo-pad', 60, 0);
    for (let i = 0; i < 6; i++) dd.lay('flowers', -60 + i * 22, 26);
  });
  await roll(46, GO);
  await shot('boost');
  await roll(50, GO);
  await shot('turbo');
  await roll(50, GO);
}

// 3: a ramp over a wall of straw bales
if (scene('jump')) {
  await range();
  await page.evaluate(() => {
    const dd = window.__dd;
    dd.put(0, -190, 0, 0, 160);
    dd.lay('ramp', -90, 0);
    for (let k = -2; k <= 2; k++) dd.lay('hay-wall', -40, k * 8);
    for (let k = -1; k <= 1; k++) dd.lay('hay-bale', 60, k * 10);
  });
  await roll(52, GO);
  await shot('jump');
  await roll(34, GO);
  await shot('landed');
  await roll(40, GO);
}

// 4: through the hens and the sheep, round the cow
if (scene('animals')) {
  await range();
  await page.evaluate(() => {
    const dd = window.__dd;
    dd.put(0, -200, 0, 0, 150);
    dd.lay('chickens', -70, 0);
    dd.lay('chickens', -50, 8);
    dd.lay('sheep', 40, -4);
    dd.lay('crows', -110, -40);
    dd.lay('cow', 150, 6);
    // hold them where they are until the car is on them
    for (const k of dd.session.world.critters)
      if (k.def.critter.kind === 'ground')
        k.def = { ...k.def, critter: { ...k.def.critter, scare: 8 } };
  });
  await roll(48, GO);
  await shot('hens');
  await roll(40, GO);
  await shot('sheep');
  await roll(50, GO);
  await shot('cow');
  await roll(40, GO);
}

// 5: a path cut through a field of corn
if (scene('corn')) {
  await range();
  await page.evaluate(() => {
    const dd = window.__dd;
    dd.put(0, -170, 0, 0, 120);
    for (let x = -110; x <= 90; x += 6)
      for (let y = -32; y <= 32; y += 6) dd.lay('corn', x + ((y / 6) % 2) * 2, y);
  });
  await roll(80, { ...GO, steer: 0.12 });
  await shot('corn');
  await roll(50, { ...GO, steer: -0.2 });
}

// 6: on a real track: the start, a boost tile, the ramp, the animals and a corn field
const venues = (args.find((a) => a.startsWith('--venues='))?.slice(9) ?? 'kennel-loop').split(',');
if (scene('race'))
  for (const venue of venues) {
    await page.goto(`${base}?start=${venue}&car=mutt&autoplay&seed=7`);
    await page.waitForTimeout(6000);
    await page.evaluate(() => {
      const dd = window.__dd;
      dd.session.fx.quality = 1;
      dd.session.advance = () => {};
      const w = dd.session.world;
      // put the player on the road `back` art px before (x, y), pointing along the track
      dd.before = (x, y, back, v = 150) => {
        const T = w.track;
        const i = (w.grid.nearest(x, y) - Math.round(back / T.step) + T.n * 4) % T.n;
        const c = w.player;
        Object.assign(c, { x: T.x[i], y: T.y[i], h: T.a[i], z: 0, vz: 0, spin: 0, idx: i });
        c.vx = Math.cos(c.h) * v;
        c.vy = Math.sin(c.h) * v;
      };
      dd.find = (id) => w.statics.find((s) => !s.down && s.def.id === `prop.${id}`);
      dd.herd = (id) => w.critters.find((k) => k.def.id === `prop.${id}`);
    });
    await roll(20);
    await shot(`${venue}-start`);
    await step(60 * 4);
    await roll(60);
    await shot(`${venue}-go`);
    for (const [name, id, back, ticks] of [
      ['turbo', 'turbo-pad', 60, 34],
      ['ramp', 'ramp', 70, 44],
      ['big-ramp', 'big-ramp', 80, 50],
      ['corn', 'corn', 40, 30],
    ]) {
      const ok = await page.evaluate(
        ([id, back]) => {
          const s = window.__dd.find(id);
          if (s) window.__dd.before(s.x, s.y, back);
          return !!s;
        },
        [id, back],
      );
      if (!ok) continue;
      await roll(ticks);
      await shot(`${venue}-${name}`);
      await roll(40);
    }
    for (const id of ['chickens', 'sheep', 'cow', 'deer', 'penguins', 'crows', 'gulls']) {
      const ok = await page.evaluate((id) => {
        const k = window.__dd.herd(id);
        if (k) window.__dd.before(k.hx, k.hy, 70, 120);
        return !!k;
      }, id);
      if (!ok) continue;
      await roll(26);
      await shot(`${venue}-${id}`);
      await roll(30);
    }
  }

await browser.close();
server.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`saved to ${out}/`);
