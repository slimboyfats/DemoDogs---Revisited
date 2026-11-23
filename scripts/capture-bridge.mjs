// Bridge captures: serve the built client in headless Chromium (844x390) and knock the legs out
// from under the raised roads, to see the deck sag and come down: the Tumble Heights overpass
// with one leg gone, the same with a hole blown in the deck, and a Knotwood flyover span.
// `pnpm build && node scripts/capture-bridge.mjs [out-dir] [--only=scene] [--frames] [--dpr=1]`
// (default captures/bridge/). With --frames it also saves a frame every other tick, for a video.
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
const out = args.find((a) => !a.startsWith('--')) ?? 'captures/bridge';
const only = args.find((a) => a.startsWith('--only='))?.slice(7);
const frames = args.includes('--frames');
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
 * Open the test range on a venue with time stopped and the panel hidden, rest the camera
 * on the middle of the bridge `pick` chooses and park the player's car beside it. Leaves `__dd.bridge` = the deck
 * and legs of that beam.
 */
const stage = async (venue, pick, dx, dy) => {
  await page.goto(`${base}?dev&car=mutt&venue=${venue}`);
  await page.waitForTimeout(3500);
  await page.evaluate(
    ([pick, dx, dy]) => {
      const dd = window.__dd;
      dd.dev.setRate(3);
      dd.session.fx.quality = 1;
      document.getElementById('devPanel').style.visibility = 'hidden';
      const w = dd.session.world;
      for (const c of w.cars) c.ai = null;
      const all = w.statics.filter((s) => s.beam !== undefined);
      const beams = [...new Set(all.map((s) => s.beam))];
      const beam = beams[pick];
      const deck = all.filter((s) => s.beam === beam && s.link !== undefined);
      const legs = all.filter((s) => s.beam === beam && s.holds !== undefined);
      dd.bridge = { deck, legs };
      const m = deck[Math.floor(deck.length / 2)];
      const P = w.player;
      // the player's car is held where it is put, whatever goes off
      dd.park = { x: m.x + dx, y: m.y + dy, z: 0, vx: 0, vy: 0, vf: 0, vz: 0, spin: 0, armor: 999 };
      Object.assign(P, dd.park);
      // and the camera rests on the bridge itself
      const spot = { x: m.x, y: m.y };
      Object.defineProperty(dd.session, 'spot', { get: () => spot, set: () => {} });
      w.cars.forEach((c, i) => {
        if (c !== P) Object.assign(c, { x: P.x + 500, y: P.y + 300 + i * 30 });
      });
    },
    [pick, dx, dy],
  );
};
const step = (n) =>
  page.evaluate((n) => {
    const s = window.__dd.session;
    s.o.input.read = () => ({ steer: 0, throttle: 0, brake: true, boost: false, fire: false });
    for (let i = 0; i < n; i++) {
      Object.assign(s.world.player, window.__dd.park);
      s.step();
      Object.assign(s.world.player, window.__dd.park);
    }
  }, n);
const shot = async (name) => {
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${out}/${name}.png` });
};
let reel = 0;
const roll = async (n) => {
  for (let i = 0; i < n; i += 2) {
    await step(2);
    await page.waitForTimeout(frames ? 60 : 20);
    if (frames)
      await page.screenshot({
        path: `${out}/f${String(reel++).padStart(4, '0')}.png`,
        scale: 'css',
      });
  }
};
/** Blast a piece of the staged bridge until it is down. */
const blast = (what, i) =>
  page.evaluate(
    ([what, i]) => {
      const dd = window.__dd;
      const list = dd.bridge[what];
      const s = list[i < 0 ? list.length + i : i];
      // one blast is enough for the film: it is on its last legs
      s.hp = 1;
      dd.dev.use(s.x, s.y, 'blast');
    },
    [what, i],
  );
const scene = (name) => !only || only === name;

// 1: the overpass loses one leg: that lane sags and comes down across the road
if (scene('leg')) {
  await stage('tumble-heights', 0, -70, 50);
  await roll(100);
  await shot('leg-0-before');
  await blast('legs', 0);
  await roll(10);
  await shot('leg-1-sagging');
  await roll(24);
  await shot('leg-2-falling');
  await roll(120);
  await shot('leg-3-down');
}

// 2: a hole in the middle of the deck: both halves were hanging on across it
if (scene('hole')) {
  await stage('tumble-heights', 1, -70, 50);
  await roll(100);
  await blast('deck', 4);
  await roll(10);
  await shot('hole-1-sagging');
  await roll(24);
  await shot('hole-2-falling');
  await roll(120);
  await shot('hole-3-down');
}

// 3: a flyover span with its pillars gone, out to the pillars either side; then it is rebuilt
if (scene('flyover')) {
  await stage('knotwood', 0, 0, 85);
  await roll(100);
  await shot('flyover-0-before');
  await blast('legs', 2);
  await roll(12);
  await shot('flyover-1-sagging');
  await roll(100);
  await shot('flyover-2-falling');
  await roll(120);
  await shot('flyover-3-down');
  if (!frames) {
    // the wait is not worth filming: run it without drawing, then let the picture catch up
    await step(60 * 15);
    await roll(40);
    await shot('flyover-4-rebuilt');
  }
}

await browser.close();
server.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`bridge captures in ${out}/`);
