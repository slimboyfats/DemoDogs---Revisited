// Moving-part captures: stage the windmill, the radar tower, flags, the scarecrow and the animals
// on the test range in headless Chromium (844x390, dpr 2) and save stills, and frames for a video
// when asked. `pnpm build && node scripts/capture-bones.mjs [out-dir] [--only=scene] [--frames]
// [--dpr=1]` (default captures/bones/). Scenes: mill, gale, herd, hurt, tracks.
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
const out = args.find((a) => !a.startsWith('--')) ?? 'captures/bones';
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
/** The middle of the screen, twice as close: where every scene here is staged. */
const clip = { x: 211, y: 22, width: 422, height: 195 };
const shot = async (name) => {
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${out}/${name}.png`, clip });
};
let reel = 0;
/**
 * Run n ticks; with --frames, save a frame every other tick for the video. `each(i)` is called
 * in the page before every pair of ticks, with how many ticks have gone.
 */
const roll = async (n, ctl, each) => {
  for (let i = 0; i < n; i += 2) {
    if (each) await page.evaluate(each, i);
    await step(2, ctl);
    if (!frames) {
      // fire and smoke only move in frames that are drawn
      if (i % 4 === 0) await page.waitForTimeout(30);
      continue;
    }
    await page.waitForTimeout(60);
    await page.screenshot({ path: `${out}/f${String(reel++).padStart(4, '0')}.png`, clip });
  }
};
/** Car 1 driven past, left to right, `dy` below home: 1.2 art px a tick. */
const pass = (dy) => new Function('i', `window.__dd.put(1, -150 + i * 1.2, ${dy}, 0, 72);`);
const IDLE = { steer: 0, throttle: 0, brake: false, boost: false, fire: false };
const scene = (name) => !only || only === name;

/** The mill, the radar tower, two flags and a scarecrow, with the player parked in front. */
const yard = () =>
  page.evaluate(() => {
    const dd = window.__dd;
    dd.put(0, 0, 44, 0);
    dd.lay('windmill', -58, -4);
    dd.mill = dd.session.world.statics.at(-1);
    dd.lay('radar-tower', 62, 0);
    dd.lay('flag', -24, -22);
    dd.lay('flag', 24, -22);
    dd.lay('scarecrow', 0, 6);
  });

// 1: in the breeze: sails turning, the dish sweeping, the scarecrow watching a car go by
if (scene('mill')) {
  await range();
  await yard();
  await roll(70, IDLE);
  await shot('mill-breeze');
  await roll(240, IDLE, pass(22));
  await shot('mill-watched');
}

// 2: the same in a gale: the sails fly round and the flags stream out
if (scene('gale')) {
  await range('&mods=gale');
  await yard();
  await roll(180, IDLE);
  await shot('mill-gale');
}

// 3: a herd: heads turn to the car going by, and each animal walks through a whole stride
if (scene('herd')) {
  await range();
  await page.evaluate(() => {
    const dd = window.__dd;
    dd.put(0, 0, 44, 0);
    ['cow', 'sheep', 'deer', 'cow', 'sheep', 'deer'].forEach((id, k) =>
      dd.lay(id, -70 + k * 28, -8 - (k % 2) * 20),
    );
  });
  await roll(60, IDLE);
  await shot('herd-standing');
  await roll(130, IDLE, pass(22));
  await shot('herd-watching');
  await roll(110, IDLE, pass(22));
}

// 4: a mill that has been hit stops turning, and comes down as one heap
if (scene('hurt')) {
  await range();
  await yard();
  await roll(70, IDLE);
  for (let k = 0; k < 16; k++) {
    if (await page.evaluate(() => window.__dd.mill?.down)) break;
    await page.evaluate(() => {
      const dd = window.__dd;
      dd.dev.use(dd.home.x - 52, dd.home.y - 2, 'blast');
    });
    await roll(30, IDLE);
    if (k === 1) await shot('mill-hurt');
  }
  await roll(80, IDLE);
  await shot('mill-down');
}

// 5: where they stand on the tracks
if (scene('tracks'))
  for (const [venue, id] of [
    ['kennel-loop', 'prop.windmill'],
    ['pinewood-sprint', 'prop.windmill'],
    ['frostbite-quarry', 'prop.radar-tower'],
  ]) {
    await page.goto(`${base}?start=${venue}&car=mutt&seed=7`);
    await page.waitForTimeout(3500);
    const n = await page.evaluate((id) => {
      const dd = window.__dd;
      const w = dd.session.world;
      dd.session.fx.quality = 1;
      for (const c of w.cars) c.ai = null;
      dd.spots = w.statics.filter((s) => s.def.id === id);
      return dd.spots.length;
    }, id);
    for (let k = 0; k < n; k++) {
      await page.evaluate((k) => {
        const dd = window.__dd;
        const s = dd.spots[k];
        const c = dd.session.world.player;
        // parked just north of it, so it stands in the middle of the picture
        Object.assign(c, { x: s.x + 6, y: s.y - 16, h: 0, vx: 0, vy: 0, vf: 0, z: 0 });
        Object.assign(dd.session.cam, { x: c.x, y: c.y });
      }, k);
      await roll(40, IDLE);
      await page.waitForTimeout(250);
      await page.screenshot({ path: `${out}/${venue}-${k + 1}.png` });
    }
  }

await browser.close();
server.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`saved to ${out}/`);
