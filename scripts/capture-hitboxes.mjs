// The hitbox view, to look at: every car's hull, a spread of scenery with its hit shapes, the
// lamps and beams at night with the car turned each way, and race frames with heights on.
// Headless Chromium at 844x390, dpr 2.
// `pnpm build && node scripts/capture-hitboxes.mjs [out-dir] [venue ...] [--only=scene] [--frames]
// [--dpr=1] [--dist=dir]` (default captures/hitboxes/; the venues are for the race scene).
// Scenes: cars, props, lamps, guns, race, roads, drive.
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
const [out = 'captures/hitboxes', ...venues] = args.filter((a) => !a.startsWith('--'));
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

/** The test range, time stopped, panel hidden, cleared round the middle; `dd.home` is the middle. */
const range = async (query = '') => {
  await page.goto(`${base}?dev&car=mutt${query}`);
  await page.waitForFunction(() => window.__dd?.session, null, { timeout: 180000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    const dd = window.__dd;
    dd.dev.setRate(3);
    dd.session.fx.quality = 1;
    document.getElementById('devPanel').style.visibility = 'hidden';
    const w = dd.session.world;
    for (const c of w.cars) Object.assign(c, { ai: null, rounds: 0 });
    for (const p of w.props) p.alive = false;
    const P = (dd.home = { x: w.player.x, y: w.player.y });
    for (const s of w.statics) if (Math.hypot(s.x - P.x, s.y - P.y) < 320) s.down = true;
    w.critters.length = 0;
    for (const p of w.pickups) p.on = false;
    // everyone in a far corner until a scene parks them
    for (const c of w.cars) Object.assign(c, { x: 80 + c.index * 34, y: 70, h: 0, vx: 0, vy: 0 });
    dd.lay = (id, x, y, rot = 0) => {
      const n = w.statics.length;
      const m = w.props.length;
      dd.dev.propSel.value = `prop.${id}`;
      dd.dev.use(x, y, 'prop');
      if (w.statics.length > n) w.statics[n].rot = rot;
      if (w.props.length > m) w.props[m].rot = rot;
    };
    dd.session.follow = false;
    Object.assign(dd.session.cam, { x: P.x, y: P.y });
  });
};
const IDLE = { steer: 0, throttle: 0, brake: false, boost: false, fire: false };
const step = (n, ctl = IDLE) =>
  page.evaluate(
    ([n, ctl]) => {
      const s = window.__dd.session;
      s.o.input.read = () => ctl;
      for (let i = 0; i < n; i++) s.step();
    },
    [n, ctl],
  );
const settle = async (n) => {
  for (let i = 0; i < n; i += 4) {
    await step(4);
    await page.waitForTimeout(30);
  }
};
const shot = async (name) => {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log(`${out}/${name}.png`);
};
const view = (mode) => page.evaluate((mode) => (window.__dd.hitboxes.mode = mode), mode);
const scene = (name) => !only || only === name;

// 1: every car, nose to the right and turned, with its hull
if (scene('cars')) {
  await range('&zoom=close');
  await page.evaluate(() => {
    const dd = window.__dd;
    const w = dd.session.world;
    const P = dd.home;
    const row = [...w.cars].sort((a, b) => a.def.price - b.def.price);
    row.forEach((c, i) =>
      Object.assign(c, {
        x: P.x + ((i % 6) - 2.5) * 34,
        y: P.y + (Math.floor(i / 6) - 0.5) * 38,
        h: i >= 6 ? -0.5 : 0,
        vx: 0,
        vy: 0,
        vf: 0,
      }),
    );
  });
  await settle(30);
  await view('boxes');
  await shot('cars');
  // (and what a shot meets: each body slice by slice)
  await view('heights');
  await shot('cars-heights');
  // (and with the add-ons that stand out of a car bolted on: jaws across the nose, plates)
  await page.evaluate(() => {
    const dd = window.__dd;
    for (const id of ['pickup.scrap-jaws', 'pickup.hackles']) {
      dd.dev.pickupSel.value = id;
      for (const c of dd.session.world.cars) dd.dev.use(c.x, c.y, 'give');
    }
  });
  await settle(10);
  await shot('cars-gear-heights');
}

// 2: scenery and loose props in rows, each with its hit shape, a car beside them for size
if (scene('props')) {
  const sets = {
    walls: [
      'armco',
      'barrier',
      'brick-wall',
      'concrete-wall',
      'plank-fence',
      'rail-steel',
      'window-wall',
      'hay-wall',
      'road-block',
      'chevron-sign',
      'dam-wall',
      'brick-post',
    ],
    big: [
      'container-red',
      'husk',
      'husk-van',
      'parked-car',
      'fuel-barge',
      'log-pile',
      'grandstand',
      'scrap-tower',
      'shopfront',
      'tower-steel',
      'chimney',
      'sandstone-cliff',
    ],
    trees: [
      'tree',
      'birch',
      'maple',
      'poplar',
      'pine',
      'cactus',
      'snag',
      'giant-oak',
      'bush',
      'rock',
      'rockfall',
      'lamppost',
    ],
    loose: [
      'barrel',
      'oil-drum',
      'crate',
      'cone',
      'hay-bale',
      'tyres',
      'water-butt',
      'powder-keg',
      'fuel-tank',
      'container-red-loose',
      'scrap-slab',
      'big-bone',
    ],
    posts: [
      'bollard',
      'gantry-leg',
      'crane-leg',
      'crusher-post',
      'overpass-pillar',
      'flyover-pillar',
      'pier-pile',
      'pylon',
      'water-tower',
      'gas-pump',
      'snowman',
      'scarecrow',
    ],
  };
  for (const [name, ids] of Object.entries(sets)) {
    await range('&zoom=close');
    await page.evaluate((ids) => {
      const dd = window.__dd;
      const P = dd.home;
      ids.forEach((id, i) => {
        const x = P.x + ((i % 6) - 2.5) * 34;
        const y = P.y + (Math.floor(i / 6) - 0.5) * 44;
        // (turned a little, so a box is seen to turn with what it is the box of)
        dd.lay(id, x, y, i % 2 ? 0.5 : 0);
      });
      Object.assign(dd.session.world.player, { x: P.x - 120, y: P.y, h: 0 });
    }, ids);
    await settle(30);
    await view('boxes');
    await shot(`props-${name}`);
    // (and each piece of each shape from its foot to its top)
    await view('heights');
    await shot(`props-${name}-heights`);
  }
}

// 3: night: the car turned eight ways, its lamps and the foot of their beams
if (scene('lamps')) {
  for (const hits of ['off', 'heights']) {
    await range('&zoom=close&sky=night');
    await page.evaluate(() => {
      const dd = window.__dd;
      const w = dd.session.world;
      const P = dd.home;
      const ids = ['mutt', 'corgi', 'greyhound', 'mastiff', 'husky', 'pug', 'whippet', 'bruiser'];
      ids.forEach((id, i) => {
        const c = w.cars.find((c) => c.def.id === `car.${id}`);
        if (!c) return;
        Object.assign(c, {
          x: P.x + ((i % 4) - 1.5) * 52,
          y: P.y + (Math.floor(i / 4) - 0.5) * 46,
          h: (i * Math.PI) / 4,
          vx: 0,
          vy: 0,
          vf: 0,
        });
      });
    });
    await settle(40);
    await view(hits);
    await shot(`lamps-${hits}`);
  }
}

// 3b: the nose gun: a rival behind a wall (no round goes through it), a big one a little off the
// line (the round lands on its bodywork)
if (scene('guns')) {
  /** Step until the player's gun has just fired (or `max` ticks have gone), and stop there. */
  const fire = (max = 90) =>
    page.evaluate((max) => {
      const s = window.__dd.session;
      const w = s.world;
      const had = w.player.rounds;
      for (let i = 0; i < max && w.player.rounds === had; i++) s.step();
      s.step();
      return had - w.player.rounds;
    }, max);
  await range('&zoom=close');
  await page.evaluate(() => {
    const dd = window.__dd;
    const w = dd.session.world;
    const P = dd.home;
    const me = w.player;
    const [a, b] = w.cars.filter((c) => c !== me);
    Object.assign(me, { x: P.x - 60, y: P.y - 30, h: 0, rounds: 50, gunCd: 0 });
    Object.assign(a, { x: P.x + 20, y: P.y - 30, h: Math.PI / 2 });
    dd.lay('concrete-wall', P.x - 20, P.y - 30, Math.PI / 2);
    dd.second = () => {
      Object.assign(me, { x: P.x - 60, y: P.y + 30, h: 0, rounds: 50, gunCd: 0 });
      Object.assign(b, { x: P.x + 10, y: P.y + 38, h: Math.PI / 2, size: 1.5 });
    };
  });
  await view('heights');
  await settle(8);
  console.log('through the wall:', await fire(), 'rounds');
  await shot('guns-wall');
  await page.evaluate(() => window.__dd.second());
  await settle(8);
  console.log('off the line:', await fire(), 'rounds');
  await shot('guns-aside');
}

// 4: race frames with everything on
if (scene('race')) {
  for (const v of venues.length ? venues : ['kennel-loop', 'knotwood', 'tumble-heights']) {
    await page.goto(`${base}?start=${v}&car=mutt&autoplay&seed=7&hitboxes=heights`);
    await page.waitForFunction(() => window.__dd?.session, null, { timeout: 180000 });
    await page.waitForTimeout(2500);
    await page.evaluate(() => {
      const s = window.__dd.session;
      s.rate = 0;
      s.fx.quality = 1;
      for (let i = 0; i < 500; i++) s.step();
    });
    await shot(`race-${v}`);
  }
}

// 4b: the road itself, close up: your car parked against a flyover's rail, on its ramp, beside the
// steepest ground by the road, and in a bend
if (scene('roads')) {
  for (const v of venues.length ? venues : ['knotwood', 'tumble-heights', 'splinter-ridge']) {
    await page.goto(`${base}?start=${v}&car=mutt&autoplay&seed=7&hitboxes=heights`);
    await page.waitForFunction(() => window.__dd?.session, null, { timeout: 180000 });
    await page.waitForTimeout(2500);
    const spots = await page.evaluate(() => {
      const s = window.__dd.session;
      s.rate = 0;
      s.fx.quality = 1;
      for (let i = 0; i < 200; i++) s.step();
      const w = s.world;
      const T = w.track;
      const out = [];
      if (w.deckH) {
        let hi = 0;
        for (let i = 0; i < T.n; i++) if (w.deckH[i] > w.deckH[hi]) hi = i;
        if (w.deckH[hi] > 2) {
          out.push(['deck', hi, w.road / 2 - 6]);
          let r = hi;
          for (let n = 0; n < T.n && w.deckH[r] > w.deckH[hi] * 0.4; n++) r = (r + 1) % T.n;
          out.push(['ramp', r, 0]);
        }
      }
      if (w.relief) {
        let best = 0;
        let at = -1;
        for (let i = 0; i < T.n; i += 5)
          for (const sg of [-1, 1]) {
            const off = sg * (w.road / 2 + 20);
            const x = T.x[i] - Math.sin(T.a[i]) * off;
            const y = T.y[i] + Math.cos(T.a[i]) * off;
            const d = Math.abs(w.relief.at(x, y) - w.relief.at(T.x[i], T.y[i]));
            if (d > best) [best, at] = [d, i];
          }
        if (at >= 0) out.push(['cliff', at, 0]);
      }
      out.push(['bend', Math.floor(T.n * 0.3), w.road / 2 - 6]);
      return out;
    });
    for (const [name, i, off] of spots) {
      await page.evaluate(
        ([i, off]) => {
          const s = window.__dd.session;
          const w = s.world;
          const T = w.track;
          const a = T.a[i];
          const h = w.deckH?.[i] ?? 0;
          for (const c of w.cars) c.ai = null;
          Object.assign(w.player, {
            x: T.x[i] - Math.sin(a) * off,
            y: T.y[i] + Math.cos(a) * off,
            h: a,
            vx: 0,
            vy: 0,
            idx: i,
            z: h,
            deck: h,
          });
          for (let k = 0; k < 30; k++) s.step();
          s.follow = false;
          Object.assign(s.cam, { x: w.player.x, y: w.player.y });
        },
        [i, off],
      );
      await page.waitForTimeout(200);
      await shot(`road-${v}-${name}`);
    }
  }
}

// 5: a drive with the view on, for the video (`--frames`: 20 frames a second of game time)
if (scene('drive')) {
  for (const v of venues.length ? venues : ['knotwood']) {
    await page.goto(`${base}?start=${v}&car=mutt&autoplay&seed=7&hitboxes=heights`);
    await page.waitForFunction(() => window.__dd?.session, null, { timeout: 180000 });
    await page.waitForTimeout(2500);
    await page.evaluate(() => {
      const s = window.__dd.session;
      s.rate = 0;
      s.fx.quality = 1;
      for (let i = 0; i < 300; i++) s.step();
    });
    for (let f = 0; f < (frames ? 240 : 1); f++) {
      await page.evaluate(() => {
        const s = window.__dd.session;
        for (let i = 0; i < 3; i++) s.step();
      });
      await page.waitForTimeout(40);
      if (frames)
        await page.screenshot({
          path: `${out}/drive-${v}-${String(f).padStart(4, '0')}.png`,
          scale: 'css',
        });
    }
    await shot(`drive-${v}`);
  }
}

await browser.close();
server.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
