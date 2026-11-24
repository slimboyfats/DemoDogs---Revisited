// How cars lie on the ground: stage cars on ramps, speed bumps, dips, potholes, hills and a
// flyover in headless Chromium (844x390, dpr 2) and save stills, and frames for a video when
// asked. `pnpm build && node scripts/capture-bumps.mjs [out-dir] [--only=scene] [--frames]
// [--dpr=1] [--dist=dir]` (default captures/bumps/). Scenes: parked, sizes, drive, slope, deck.
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
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
const out = args.find((a) => !a.startsWith('--')) ?? 'captures/bumps';
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
page.on('console', (m) => m.text().startsWith('no car') && console.log(m.text()));

/** Open the test range with time stopped, the panel hidden and the ground cleared. */
const range = async (query = '') => {
  await page.goto(`${base}?dev&car=mutt&zoom=close${query}`);
  await page.waitForFunction(() => window.__dd?.session, null, { timeout: 180000 });
  await page.waitForTimeout(2500);
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
      if (!c) return console.log(`no car ${i} of ${w.cars.length}`);
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

/** Fit every add-on and guard there is to car i, and make it `scale` times its size. */
const dress = (i, scale = 1) =>
  page.evaluate(
    ([i, scale]) => {
      const w = window.__dd.session.world;
      const c = w.cars[i];
      const addons = ['rims', 'tank', 'paws', 'scoop', 'barrel', 'cage', 'magnet'];
      for (const d of w.content.pickup.values()) {
        if (addons.includes(d.kind)) c.fit[d.kind] = { def: d, t: 0, n: d.charges ?? 0, cd: 0 };
        else if (c.guards && ['flak', 'pads', 'mirror'].includes(d.kind))
          c.guards[d.kind] = { def: d, n: d.charges ?? 1, t: 999, cd: 0 };
        if ((scale > 1 && d.kind === 'grow') || (scale < 1 && d.kind === 'shrink'))
          c.morph = { def: d, t: 999 };
      }
    },
    [i, scale],
  );

// 1: cars parked on each shape, to see how they lie
if (scene('parked')) {
  await range();
  await page.evaluate(() => {
    const dd = window.__dd;
    dd.put(0, 0, 14, 0);
    dd.lay('ramp', -60, -22);
    dd.put(1, -62, -22, 0);
    for (const k of [-1, 0, 1]) dd.lay('speed-bump', -14, -22 + k * 24, 0);
    dd.put(2, -21, -22, 0);
    for (const k of [-1, 0, 1]) dd.lay('dip', 40, -22 + k * 26, 0);
    dd.put(3, 31, -22, 0);
    dd.lay('pothole', 84, -19);
    dd.put(4, 79, -22, 0);
    // and side on to the camera, and across a slope
    dd.lay('ramp', -60, 40, Math.PI);
    dd.put(5, -58, 40, Math.PI);
    dd.lay('ramp', 60, 44, Math.PI / 2);
    dd.put(6, 60, 44, 0);
  });
  await roll(60, IDLE);
  await shot('parked');
}

// 2: the same on a huge car and a shrunk one, with everything bolted on
if (scene('sizes')) {
  await range();
  await page.evaluate(() => {
    const dd = window.__dd;
    dd.put(0, -20, 34, 0);
    dd.lay('big-ramp', -95, -8);
    dd.put(1, -93, -8, 0);
    dd.lay('ramp', -5, -8);
    dd.put(2, -6, -8, 0);
    dd.lay('ramp', 55, -8);
    dd.put(3, 53, -8, 0);
    for (const k of [-1, 0, 1]) dd.lay('speed-bump', 62, 50 + k * 24, 0);
    dd.put(4, 55, 50, 0);
  });
  await dress(1, 2);
  await dress(2, 1);
  await dress(3, 0.5);
  await dress(4, 1);
  await roll(150, IDLE);
  await shot('sizes');
}

// 3: driven over at speed: bumps, a dip, potholes, a ramp
if (scene('drive')) {
  await range();
  await page.evaluate(() => {
    const dd = window.__dd;
    dd.put(0, -330, 0, 0, 150);
    for (const x of [-230, -170]) for (const k of [-1, 0, 1]) dd.lay('speed-bump', x, k * 24, 0);
    for (const k of [-1, 0, 1]) dd.lay('dip', -90, k * 26, 0);
    dd.lay('pothole', -20, 3);
    dd.lay('pothole', 30, -4);
    dd.lay('pothole', 34, 12);
    for (const k of [-1, 0, 1]) dd.lay('speed-bump', 100, k * 24, 0);
    dd.lay('ramp', 180, 0);
  });
  await roll(34, GO);
  await shot('bump-nose-up');
  await roll(8, GO);
  await shot('bump-hop');
  await roll(34, GO);
  await shot('dip');
  await roll(24, GO);
  await shot('pothole');
  await roll(70, GO);
  await shot('ramp');
  await roll(40, GO);
}

/** Open a race venue's range and park the player at track sample `pick(w)` returns. */
const onTrack = async (venue, pick) => {
  await range(`&venue=${venue}`);
  await page.evaluate((src) => {
    const dd = window.__dd;
    const w = dd.session.world;
    const T = w.track;
    const [i, z] = new Function('w', `return (${src})(w)`)(w);
    const nx = -Math.sin(T.a[i]);
    const ny = Math.cos(T.a[i]);
    const at = (c, j, off, h, dz) => {
      const k = (j + T.n) % T.n;
      Object.assign(c, { x: T.x[k] + nx * off, y: T.y[k] + ny * off, h, z: dz, vz: 0, idx: k });
      c.vx = c.vy = c.vf = c.spin = 0;
    };
    at(w.cars[0], i, 0, T.a[i], z);
    at(w.cars[1], i + 8, 16, T.a[i] + Math.PI, z);
    at(w.cars[2], i - 8, -18, T.a[i] + Math.PI / 2, z);
    at(w.cars[3], i + 16, -14, T.a[i], z);
  }, pick.toString());
  await roll(60, IDLE);
};

// 4: on a hill: nose up the climb, and tipped sideways across it
if (scene('slope')) {
  await onTrack('splinter-ridge', (w) => {
    const T = w.track;
    let best = 0;
    let top = 0;
    for (let i = 40; i < T.n - 40; i++) {
      const s = Math.hypot(w.relief.dx(T.x[i], T.y[i]), w.relief.dy(T.x[i], T.y[i]));
      if (s > top && (!w.deckH || w.deckH[i] <= 0)) [top, best] = [s, i];
    }
    return [best, 0];
  });
  await shot('slope');
}

// 5: on the climb to a flyover
if (scene('deck')) {
  await onTrack('knotwood', (w) => {
    const T = w.track;
    let best = 0;
    let top = 0;
    for (let i = 4; i < T.n - 4; i++) {
      const a = w.deckH[i + 3];
      const b = w.deckH[i - 3];
      if (a > 0 && b > 0 && a - b > top) [top, best] = [a - b, i];
    }
    return [best, w.deckH[best]];
  });
  await shot('deck');
}

await browser.close();
server.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`saved to ${out}/`);
