// A derby in which the player is scrapped and comes back as a ghost car: the WATCHING bar with its
// GHOST CAR button, the ghost getting up out of the wreck, driving, and shoving a running car.
// `pnpm ghost [out-dir] [venue] [--frames] [--sky=night]` (default captures/ghost/, the-pit):
// stills, and with --frames f0000.jpg ... for ffmpeg (15 a second).
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
const plain = args.filter((a) => !a.startsWith('--'));
const out = plain[0] ?? 'captures/ghost';
const venue = plain[1] ?? 'the-pit';
const frames = args.includes('--frames');
const sky = args.find((a) => a.startsWith('--sky='))?.slice(6);
await mkdir(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 844, height: 390 },
  isMobile: true,
  hasTouch: true,
  // (a clip is shot at one device pixel to the CSS pixel, or a frame takes seconds)
  deviceScaleFactor: frames ? 1 : 2,
});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${base}?start=${venue}&car=mutt&seed=7${sky ? `&sky=${sky}` : ''}`);
await page.waitForFunction(() => window.__dd?.session?.world.phase === 'race', null, {
  timeout: 180000,
});
await page.evaluate(() => {
  const s = window.__dd.session;
  const w = s.world;
  s.rate = 0;
  Object.defineProperty(s.fx, 'quality', { get: () => 1, set() {} });
  // the driver: flat out at the nearest car still running, a little ahead of where it is
  s.o.input.read = () => {
    const c = w.player;
    let best = null;
    let d = Infinity;
    for (const o of w.cars) {
      if (o === c || o.wrecked) continue;
      const r = Math.hypot(o.x - c.x, o.y - c.y);
      if (r < d) [best, d] = [o, r];
    }
    if (!best) return { steer: 0, throttle: 0, brake: false, boost: false, fire: false };
    const want = Math.atan2(best.y + best.vy * 0.3 - c.y, best.x + best.vx * 0.3 - c.x) - c.h;
    const turn = Math.atan2(Math.sin(want), Math.cos(want));
    return {
      steer: Math.max(-1, Math.min(1, turn * 2.5)),
      throttle: 1,
      brake: false,
      boost: false,
      fire: false,
    };
  };
});
let n = 0;
/** Run `ticks` of the race, two to a frame, shooting each frame when a clip is wanted. */
async function run(ticks) {
  for (let i = 0; i < ticks; i += 2) {
    await page.evaluate(() => {
      const s = window.__dd.session;
      s.step();
      s.step();
    });
    await page.waitForTimeout(frames ? 30 : 10);
    // (a frame for every four ticks: 15 a second, which is all a headless browser has time for)
    if (frames && i % 4 === 0)
      await page.screenshot({
        path: `${out}/f${String(n++).padStart(4, '0')}.jpg`,
        scale: 'css',
        quality: 90,
      });
  }
}
const shot = async (name) => {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${name}.png` });
};
const state = () =>
  page.evaluate(() => {
    const w = window.__dd.session.world;
    const P = w.player;
    return {
      wrecked: P.wrecked,
      ghost: P.haunt ? (P.haunt.up ? 'up' : 'away') : 'none',
      running: w.cars.filter((c) => !c.wrecked).length,
      hp: w.cars.map((c) => Math.round(c.hp)),
      phase: w.phase,
    };
  });

await run(150);
// scrapped: blasts under the player until it is a wreck
await page.evaluate(() => {
  const dd = window.__dd;
  const w = dd.session.world;
  for (let i = 0; i < 40 && !w.player.wrecked; i++) {
    dd.blast(w.player.x, w.player.y, 1.5);
    dd.session.step();
  }
});
await run(110);
// the spectator's bar, with the way into the ghost car on it
await page.waitForFunction(
  () => !document.getElementById('specGhost').classList.contains('hidden'),
);
await shot('1-watching-with-ghost-button');
await page.locator('#specGhost').dispatchEvent('pointerdown');
await page.waitForFunction(() => document.body.classList.contains('ghosting'));
await shot('2-ghost-bar-before-rising');
await run(40);
await shot('3-ghost-gets-up');
console.log('risen', JSON.stringify(await state()));
const before = (await state()).hp;
let spooks = 0;
for (let k = 0; k < 9; k++) {
  await run(60);
  const boo = await page.evaluate(() =>
    window.__dd.session.fx.texts?.some?.((t) => t.text === 'BOO!'),
  );
  if (boo && spooks < 3) await shot(`4-boo-${++spooks}`);
}
await shot('5-ghost-driving');
// back to watching: the ghost is left alone and goes
await page.locator('#ghostWatch').dispatchEvent('pointerdown');
await run(60 * 5);
await shot('6-watching-again-ghost-gone');
const end = await state();
console.log('end', JSON.stringify(end), 'hp before', JSON.stringify(before));
await browser.close();
server.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`${out}: ${n} frames`);
