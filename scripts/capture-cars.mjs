// The cars, to look at: parked in a row on the test range, by day and by night with their lamps
// on, with every add-on fitted at three sizes and tipped on ramps, and each one driven round a
// track for a video. Headless Chromium at 844x390, dpr 2.
// `pnpm build && node scripts/capture-cars.mjs [out-dir] [car ...] [--only=scene] [--frames]
// [--dpr=1] [--dist=dir]` (default captures/cars/, every car). Scenes: lineup, night, gear, drive.
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
const [out = 'captures/cars', ...picked] = args.filter((a) => !a.startsWith('--'));
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

/**
 * Open the test range with time stopped, the panel hidden and the ground cleared, and park the
 * cars asked for (all of them if none were) in rows of `per`, `gapX` by `gapY` apart, turned `h`.
 * Leaves `dd.row`: those cars, in the order they stand.
 */
const range = async (query, per, gapX, gapY, h = 0) => {
  // (the player's own car is one of the row: cars far from it are drawn flat)
  await page.goto(`${base}?dev&car=${picked[0] ?? 'mutt'}&zoom=close${query}`);
  await page.waitForFunction(() => window.__dd?.session, null, { timeout: 180000 });
  await page.waitForTimeout(2500);
  await page.evaluate(
    ([picked, per, gapX, gapY, h]) => {
      const dd = window.__dd;
      dd.dev.setRate(3);
      dd.session.fx.quality = 1;
      document.getElementById('devPanel').style.visibility = 'hidden';
      const w = dd.session.world;
      for (const c of w.cars) c.ai = null;
      for (const p of w.props) p.alive = false;
      const P = (dd.home = { x: w.player.x, y: w.player.y });
      for (const s of w.statics)
        if (Math.hypot(s.x - P.x, s.y - P.y) < 300 && s.def.radius < 8) s.down = true;
      w.critters.length = 0;
      const want = picked.length
        ? picked.map((id) => w.cars.find((c) => c.def.id === `car.${id}`)).filter(Boolean)
        : [...w.cars].sort((a, b) => a.def.price - b.def.price);
      dd.row = want;
      const rows = Math.ceil(want.length / per);
      const spot = (i) => ({
        x: P.x + ((i % per) - (Math.min(per, want.length) - 1) / 2) * gapX,
        y: P.y + (Math.floor(i / per) - (rows - 1) / 2) * gapY,
      });
      // everyone else in a far corner of the bowl, out of the picture
      for (const c of w.cars) Object.assign(c, { x: 80 + c.index * 34, y: 70, h: 0, vx: 0, vy: 0 });
      want.forEach((c, i) => Object.assign(c, spot(i), { h, vx: 0, vy: 0, vf: 0, z: 0, vz: 0 }));
      dd.lay = (id, x, y, rot = 0) => {
        const n = w.statics.length;
        dd.dev.propSel.value = `prop.${id}`;
        dd.dev.use(x, y, 'prop');
        if (w.statics.length > n) w.statics[n].rot = rot;
      };
      // look at the middle of the rows, whoever is standing there
      dd.session.follow = false;
      Object.assign(dd.session.cam, { x: P.x, y: P.y });
    },
    [picked, per, gapX, gapY, h],
  );
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
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log(`${out}/${name}.png`);
};
const scene = (name) => !only || only === name;

/** Fit every add-on and guard there is to each car of the row, and make car i `sizes[i]` times its size. */
const dress = (sizes) =>
  page.evaluate((sizes) => {
    const dd = window.__dd;
    const w = dd.session.world;
    const addons = ['rims', 'tank', 'paws', 'scoop', 'barrel', 'cage', 'magnet'];
    dd.row.forEach((c, i) => {
      const scale = sizes[i % sizes.length];
      for (const d of w.content.pickup.values()) {
        if (addons.includes(d.kind)) c.fit[d.kind] = { def: d, t: 0, n: d.charges ?? 0, cd: 0 };
        else if (c.guards && ['flak', 'pads', 'mirror'].includes(d.kind))
          c.guards[d.kind] = { def: d, n: d.charges ?? 1, t: 999, cd: 0 };
        if ((scale > 1 && d.kind === 'grow') || (scale < 1 && d.kind === 'shrink'))
          c.morph = { def: d, t: 999 };
      }
    });
  }, sizes);

// 1: parked in a row, cheapest first, nose to the right and then nose towards the camera
if (scene('lineup')) {
  await range('', 6, 36, 34);
  await settle(40);
  await shot('lineup');
  await range('', 6, 36, 40, Math.PI * 0.5);
  await settle(40);
  await shot('lineup-nose-on');
  await range('', 6, 36, 36, -Math.PI * 0.22);
  await settle(40);
  await shot('lineup-turned');
}

// 2: the same at night: head and tail lamps, and whatever else on them is a light
if (scene('night')) {
  await range('&sky=night', 6, 36, 60);
  await settle(40);
  await shot('night');
}

// 3: every add-on and guard bolted on, at full size, grown and shrunk, and nose up on a ramp
if (scene('gear')) {
  await range('', 6, 48, 52);
  await page.evaluate(() => {
    const dd = window.__dd;
    dd.row.forEach((c, i) => {
      if (i % 2) return;
      dd.lay('ramp', c.x - 2, c.y);
    });
  });
  await dress([1, 1, 1.6, 0.6]);
  await settle(150);
  await shot('gear');
}

// 4: each car driven round a track by the game's own driver, for the video
if (scene('drive')) {
  const ids = picked.length ? picked : ['mutt'];
  for (const id of ids) {
    await page.goto(`${base}?start=kennel-loop&car=${id}&autoplay&seed=7`);
    await page.waitForFunction(() => window.__dd?.session, null, { timeout: 180000 });
    await page.waitForTimeout(2500);
    await page.evaluate(() => (window.__dd.session.rate = 0));
    // off the grid and up to speed before the film starts
    await page.evaluate(() => {
      const s = window.__dd.session;
      for (let i = 0; i < 420; i++) s.step();
    });
    for (let f = 0; f < (frames ? 150 : 1); f++) {
      await page.evaluate(() => {
        const s = window.__dd.session;
        s.step();
        s.step();
      });
      await page.waitForTimeout(60);
      if (frames)
        await page.screenshot({
          path: `${out}/drive-${id}-${String(f).padStart(4, '0')}.png`,
          scale: 'css',
        });
    }
    await shot(`drive-${id}`);
  }
}

await browser.close();
server.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
