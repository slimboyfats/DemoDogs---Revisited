// The driving lesson, taken by touch at a phone's size: a thumb on the stick drives through the
// rings, the buttons are held and tapped as the card asks, and the last card is reached. Shoots
// each step (and every frame with --frames, for a clip). Serves the built client; run with
// `pnpm play:lesson [out-dir] [--portrait] [--frames] [--video]` (it builds first).
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');

const args = process.argv.slice(2);
const portrait = args.includes('--portrait');
const frames = args.includes('--frames');
// --video films it as it is played (no stills along the way: a still stalls the game)
const video = args.includes('--video');
const out = args.find((a) => !a.startsWith('--')) ?? 'captures/lesson';
const root = new URL('../packages/client/dist/', import.meta.url).pathname;
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.webmanifest': 'application/manifest+json',
};
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(
    /^(\.\.[/\\])+/,
    '',
  );
  try {
    const file = join(root, path.endsWith('/') ? `${path}index.html` : path);
    const body = await readFile(file);
    res
      .writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' })
      .end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}/`;
await mkdir(out, { recursive: true });
if (frames) await mkdir(join(out, 'frames'), { recursive: true });

const size = portrait ? { width: 390, height: 844 } : { width: 844, height: 390 };
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: size,
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
  ...(video ? { recordVideo: { dir: out, size } } : {}),
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

const tag = portrait ? '-portrait' : '';
const shot = async (name) => {
  if (video) return;
  await page.screenshot({ path: join(out, `${name}${tag}.png`) });
  console.log(`  ${name}${tag}.png`);
};
let frameNo = 0;
const film = async () => {
  if (!frames) return;
  const n = String(frameNo++).padStart(5, '0');
  await page.screenshot({ path: join(out, 'frames', `f${n}.jpg`), type: 'jpeg', quality: 80 });
};

/** A finger: pointer events on an element, as the game's own listeners take them. */
const finger = (sel, type, x, y, id) =>
  page.evaluate(
    ([sel, type, x, y, id]) =>
      document.querySelector(sel).dispatchEvent(
        new PointerEvent(type, {
          pointerId: id,
          clientX: x,
          clientY: y,
          bubbles: true,
          cancelable: true,
          pointerType: 'touch',
        }),
      ),
    [sel, type, x, y, id],
  );
// where the thumb rests on the stick, and the buttons' own fingers
const thumb = { x: size.width * 0.22, y: size.height * 0.7 };
let steering = false;
const steer = async (angle, push = 1) => {
  if (!steering) await finger('#stickZone', 'pointerdown', thumb.x, thumb.y, 1);
  steering = true;
  await finger(
    '#stickZone',
    'pointermove',
    thumb.x + Math.cos(angle) * 56 * push,
    thumb.y + Math.sin(angle) * 56 * push,
    1,
  );
};
const letGo = async () => {
  if (steering) await finger('#stickZone', 'pointerup', thumb.x, thumb.y, 1);
  steering = false;
};
const held = new Set();
const press = async (id, on) => {
  if (held.has(id) === on) return;
  if (on) held.add(id);
  else held.delete(id);
  await finger(`#${id}`, on ? 'pointerdown' : 'pointerup', 0, 0, 2 + id.length);
};
const read = () =>
  page.evaluate(() => {
    const d = window.__dd;
    const P = d.session?.world.player;
    const w = d.session?.world;
    return {
      screen: d.screen,
      lesson: d.lesson.state,
      end: !document.getElementById('tutEnd').classList.contains('hidden'),
      car: P ? { x: P.x, y: P.y, h: P.h, v: Math.hypot(P.vx, P.vy), armed: !!P.weapon } : null,
      mid: w ? { x: w.w / 2, y: w.h / 2 } : null,
      crate: w?.pickups[0] ?? null,
      targets: w
        ? w.cars.filter((c) => c !== P && !c.wrecked).map((c) => ({ x: c.x, y: c.y }))
        : [],
    };
  });

// the offer a new player gets, then the lesson itself
await page.goto(`${base}?lesson=ask`);
await page.waitForTimeout(900);
await shot('0-offer');
await page.locator('#tutYes').click();
await page.waitForFunction(() => window.__dd.lesson.state, null, { timeout: 120000 });
await page.waitForTimeout(600);

const STEP_NO = { drive: 1, brake: 2, boost: 3, crate: 4, fire: 5 };
const seen = new Set();
const t0 = Date.now();
let cheered = '';
let slow = 0;
let backing = 0;
for (;;) {
  const s = await read();
  if (s.end) break;
  if (Date.now() - t0 > 300000) throw new Error(`the lesson stuck at ${s.lesson?.step}`);
  const L = s.lesson;
  if (!L || !s.car) {
    await page.waitForTimeout(100);
    continue;
  }
  const to = (p) => Math.atan2(p.y - s.car.y, p.x - s.car.x);
  if (L.cheering) {
    if (cheered !== L.step) {
      cheered = L.step;
      await page.waitForTimeout(350);
      await shot(`${STEP_NO[L.step]}-${L.step}-done`);
    }
    for (const b of ['btnBrake', 'btnBoost']) await press(b, false);
  } else if (backing > 0) {
    // nose against the fence: back straight out, as a driver would
    backing--;
    await steer(s.car.h + Math.PI, 1);
    await press('btnBrake', true);
    if (backing === 0) await press('btnBrake', false);
  } else if (L.step !== 'brake' && s.car.v < 6 && ++slow > 12) {
    slow = 0;
    backing = 10;
  } else if (L.step === 'drive') await steer(to(L.spots[L.ring]), 0.9);
  else if (L.step === 'brake') {
    await letGo();
    await press('btnBrake', true);
  } else if (L.step === 'boost') {
    await steer(to(s.mid), 1);
    await press('btnBoost', true);
  } else if (L.step === 'crate' && s.crate) await steer(to(s.crate), 0.8);
  else if (L.step === 'fire' && s.targets[0]) {
    const aim = to(s.targets[0]);
    await steer(aim, 0.35);
    let off = Math.abs(aim - s.car.h) % (Math.PI * 2);
    if (off > Math.PI) off = Math.PI * 2 - off;
    if (off < 0.12 && s.car.armed && seen.has('fire')) {
      await press('btnFire', true);
      await press('btnFire', false);
    }
  }
  // each step as it is first seen, once its card has dropped in
  if (!L.cheering && !seen.has(L.step)) {
    await page.waitForTimeout(500);
    await shot(`${STEP_NO[L.step]}-${L.step}`);
    seen.add(L.step);
  }
  if (s.car.v >= 6) slow = 0;
  await film();
  if (!frames) await page.waitForTimeout(60);
}
await letGo();
await page.waitForTimeout(video ? 3000 : 400);
await shot('6-ready');
await film();

// SKIP is always there: back on the menu, where the lesson can be had again
await page.goto(`${base}?lesson=2`);
await page.waitForFunction(() => window.__dd.lesson.state, null, { timeout: 120000 });
await page.locator('#tutSkip').click();
await page.waitForTimeout(400);
const after = await page.evaluate(() => window.__dd.screen);
if (after !== 'menu') errors.push(`SKIP left the screen at ${after}`);

await context.close();
if (video) console.log(`  ${await page.video().path()}`);
await browser.close();
server.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('the lesson was taken to the end by touch');
