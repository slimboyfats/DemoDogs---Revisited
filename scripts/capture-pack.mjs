// Pack captures: one real race of eight in headless Chromium (844x390), with the things that keep
// a field together set off in it one after another: the Runt Ray on everybody, a Bloodhound sent
// from the back and one landing on the player, a pack of Sniffers, and a car finding its feet
// after the tow truck. Stills at dpr 2, or frames for a video (dpr 1) when asked.
// `pnpm pack [out-dir] [venue] [--frames]` (default captures/pack/, kennel-loop).
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
const plain = args.filter((a) => !a.startsWith('--'));
const out = plain[0] ?? 'captures/pack';
const venue = plain[1] ?? 'kennel-loop';
await mkdir(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 844, height: 390 },
  isMobile: true,
  hasTouch: true,
  // (frames for a video are taken at 1: a frame at 2 costs several seconds in software GL)
  deviceScaleFactor: frames ? 1 : 2,
});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

const step = (n) =>
  page.evaluate((n) => {
    const s = window.__dd.session;
    for (let i = 0; i < n; i++) s.step();
  }, n);
const shot = async (name) => {
  if (frames) return;
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${out}/${name}.png` });
};
let reel = 0;
/** Run n ticks; with --frames, save a frame every other tick for the video. */
const roll = async (n) => {
  if (!frames) return step(n);
  for (let i = 0; i < n; i += 2) {
    await step(2);
    await page.waitForTimeout(40);
    await page.screenshot({ path: `${out}/f${String(reel++).padStart(4, '0')}.png` });
  }
};
/** Step (unseen) until `test` (a function body over `w`) is true, or `max` ticks; ticks run. */
const until = (test, max) =>
  page.evaluate(
    ([test, max]) => {
      const s = window.__dd.session;
      const ok = new Function('w', test);
      for (let i = 0; i < max; i++) {
        if (ok(s.world)) return i;
        s.step();
      }
      return -1;
    },
    [test, max],
  );
const say = async (what) => console.log(what, JSON.stringify(await page.evaluate(what)));

await page.goto(`${base}?start=${venue}&car=mutt&autoplay&seed=7`);
await page.waitForTimeout(7000);
await page.evaluate(() => {
  const s = window.__dd.session;
  s.rate = 0;
  // the player to the front of the pack, the car in front `gap` samples of road behind it
  window.lead = (gap) => {
    const w = s.world;
    const P = w.player;
    // (a gap below 0: that far behind the third car instead, in the thick of it)
    const o = w.standings().filter((c) => c !== P && !c.wrecked);
    const L = gap < 0 ? o[2] : o[0];
    const T = w.track;
    const i = (L.idx + gap + T.n) % T.n;
    w.placeOnTrack(P, i, 0);
    P.lap = L.lap + (gap > 0 && i < L.idx ? 1 : gap < 0 && i > L.idx ? -1 : 0);
    P.vx = Math.cos(P.h) * 120;
    P.vy = Math.sin(P.h) * 120;
    P.z = P.deck = w.deckAt(i);
  };
  window.last = () => {
    const o = s.world.standings().filter((c) => !c.wrecked);
    return o[o.length - 1].index;
  };
});

// 1: the grid: eight cars
await step(30);
await shot('1-grid-of-eight');
await roll(60 * 3);
await until("return w.phase === 'race'", 600);
await roll(60 * 6);
await shot('2-pack-into-the-first-bend');

// 2: the Runt Ray, opened by the player: every other car is zapped small and slow
await page.evaluate(() =>
  window.__dd.give(window.__dd.session.world.player.index, 'pickup.runt-ray'),
);
await roll(16);
await shot('3-runt-ray-strikes-everybody');
await roll(60 * 2);
await shot('4-runts-all-round');
await roll(60 * 3);

// 3: a pack of Sniffers, from the middle of the field: the autopilot fires them, and they
// follow the road
await page.evaluate(() => window.lead(-28));
await roll(40);
await page.evaluate(() =>
  window.__dd.give(window.__dd.session.world.player.index, 'pickup.sniffer-pack'),
);
// (the autopilot would wait for a clear shot: for the picture it fires now)
await page.evaluate(() => {
  const P = window.__dd.session.world.player;
  const ai = P.ai;
  const drive = (w, c) => ({ ...ai.behaviour.drive(w, c), fire: true });
  P.ai = { ...ai, behaviour: { ...ai.behaviour, drive } };
  P.fireCd = 0;
  window.unfire = () => (P.ai = ai);
});
const fired = await until('return w.rockets.some((r) => r.target !== undefined)', 60 * 4);
await page.evaluate(() => window.unfire());
await roll(22);
if (fired >= 0) await shot('5-sniffer-on-the-scent');
else console.log('no sniffer was fired with a lock');
await roll(60 * 3);

// 4: a Bloodhound leaves the player's roof
await until('return w.cars.every((c) => c.size > 0.95)', 600);
await page.evaluate(() => window.lead(-40));
await roll(20);
await page.evaluate(() =>
  window.__dd.give(window.__dd.session.world.player.index, 'pickup.bloodhound'),
);
await roll(14);
await shot('6-bloodhound-away');
await roll(60 * 2);
await until('return w.hunters.length === 0', 60 * 30);

// 5: and one comes for the player, out in front: the ring, the dive, the blast
await page.evaluate(() => window.lead(40));
await roll(60);
await page.evaluate(() => window.__dd.give(window.last(), 'pickup.bloodhound'));
await roll(30);
await shot('7-marked-by-the-bloodhound');
const dive = await until('return w.hunters.some((H) => H.dive >= 0) || !w.hunters.length', 60 * 30);
if (!frames) console.log('dive after', dive);
else {
  // (the flight was stepped unseen for the stills; for the film it is rolled)
}
await roll(8);
await shot('8-bloodhound-coming-down');
await until('return w.hunters.length === 0', 120);
await roll(4);
await shot('9-fetched');
await roll(60 * 2);

// 6: finding its feet: the player is off the course, is put back, and blinks in its ring
await page.evaluate(() => {
  const w = window.__dd.session.world;
  const P = w.player;
  const T = w.track;
  P.x = T.x[P.idx] - Math.sin(T.a[P.idx]) * (w.road / 2 + 140);
  P.y = T.y[P.idx] + Math.cos(T.a[P.idx]) * (w.road / 2 + 140);
  P.vx = P.vy = 0;
  P.downT = 99;
});
await roll(40);
await shot('10-back-on-the-road-safe-and-slow');
await roll(60 * 3);

await say('window.__dd.session.world.standings().map((c) => [c.name, Math.round(c.progress)])');
if (errors.length) console.log(`page errors:\n  ${errors.join('\n  ')}`);
await browser.close();
server.close();
