// How the game feels, as far as a picture can show it: on the test range a car rams a parked one
// and a blast goes off beside it, shot frame by frame through the game's own loop (so the shake
// and the hit-stop are as played), with a badge wherever the phone would buzz. Then a made-up
// gamepad drives the car and works the menus, and the FEEL settings are shot.
// `pnpm feel [out-dir] [--frames] [--only=scene]` (it builds first); frames are f0000.png on.
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');

const args = process.argv.slice(2);
const frames = args.includes('--frames');
const only = args.find((a) => a.startsWith('--only='))?.slice(7);
const out = args.find((a) => !a.startsWith('--')) ?? 'captures/feel';
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

const browser = await chromium.launch();
const errors = [];
const scene = (name) => !only || only === name;
let reel = 0;

/** A phone with a buzzer that shows itself and a gamepad that is whatever `__pad` holds. */
async function phone() {
  const page = await browser.newPage({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(() => {
    window.__buzzes = [];
    window.__pad = null;
    // the screen's frames, handed over once `__hold` is set: `__frame(t)` then runs one
    const raf = window.requestAnimationFrame.bind(window);
    let due = [];
    window.requestAnimationFrame = (cb) => (window.__hold ? due.push(cb) : raf(cb));
    window.__frame = (t) => {
      const run = due;
      due = [];
      for (const cb of run) cb(t);
      const b = document.getElementById('buzzBadge');
      if (b && --window.__buzzLeft <= 0) b.style.display = 'none';
    };
    navigator.getGamepads = () => [window.__pad];
    navigator.vibrate = (p) => {
      const ms = [].concat(p).reduce((a, b) => a + b, 0);
      window.__buzzes.push(ms);
      let b = document.getElementById('buzzBadge');
      if (!b) {
        b = document.createElement('div');
        b.id = 'buzzBadge';
        b.style.cssText =
          'position:fixed;left:50%;top:44px;transform:translateX(-50%);z-index:99;padding:5px 12px;' +
          'font:800 13px system-ui;color:#1d1b2e;background:#ffd23f;border:3px solid #1d1b2e;' +
          'border-radius:12px;box-shadow:3px 3px 0 #1d1b2e';
        document.body.append(b);
      }
      b.textContent = `PHONE BUZZ ${ms} ms`;
      b.style.display = 'block';
      // (shown for as long as it buzzes, and long enough to read)
      window.__buzzLeft = Math.max(18, Math.round(ms / 16.7));
      return true;
    };
  });
  return page;
}

/** The made-up gamepad: these buttons down, the left stick here. */
const padIs = (page, o) =>
  page.evaluate((o) => {
    window.__pad = o && {
      id: 'made-up pad',
      connected: true,
      mapping: 'standard',
      axes: o.axes ?? [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, (_, i) => {
        const value = o.values?.[i] ?? (o.down?.includes(i) ? 1 : 0);
        return { pressed: value > 0.5, value };
      }),
    };
  }, o);

/** The test range, cleared, the other cars parked out of the way, the clock in our hands. */
async function range(page) {
  await page.goto(`${base}?dev&car=mutt`);
  await page.waitForFunction(() => window.__dd?.session, null, { timeout: 180000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    const dd = window.__dd;
    document.getElementById('devPanel').style.visibility = 'hidden';
    const w = dd.session.world;
    for (const c of w.cars) c.ai = null;
    for (const p of w.props) p.alive = false;
    const P = (dd.home = { x: w.player.x, y: w.player.y });
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
    for (let i = 1; i < w.cars.length; i++) dd.put(i, 700, 300 + i * 40);
    dd.session.rate = 1;
  });
  await page.evaluate(() => {
    window.__hold = true;
    window.__t = performance.now();
  });
  await page.waitForTimeout(300);
}

/** Run the game's own loop for n frames of a 60 Hz screen, saving each with --frames. */
async function roll(page, n) {
  for (let i = 0; i < n; i++) {
    await page.evaluate(() => window.__frame((window.__t += 1000 / 60)));
    if (frames)
      await page.screenshot({
        path: join(out, `f${String(reel++).padStart(4, '0')}.png`),
        scale: 'css',
      });
  }
}
const drive = (page, ctl) =>
  page.evaluate((ctl) => {
    window.__dd.session.o.input.read = () => ctl;
  }, ctl);
const GO = { steer: 0, throttle: 1, brake: false, boost: true, fire: false };
const IDLE = { steer: 0, throttle: 0, brake: false, boost: false, fire: false };
/** What the picture is doing: how far off it is, and how many ticks have run. */
const feelNow = (page) =>
  page.evaluate(() => {
    const s = window.__dd.session;
    return { off: Math.hypot(s.cam.ox, s.cam.oy), tick: s.world.tick, buzzes: window.__buzzes };
  });

if (scene('ram') || scene('blast')) {
  const page = await phone();
  await range(page);
  if (scene('ram')) {
    await page.evaluate(() => {
      const dd = window.__dd;
      dd.put(0, -330, 0, 0, 0);
      dd.put(1, -90, 0, Math.PI / 2);
    });
    await drive(page, GO);
    let far = 0;
    let held = 0;
    for (let i = 0; i < 22; i++) {
      const a = await feelNow(page);
      await roll(page, 5);
      const b = await feelNow(page);
      far = Math.max(far, b.off);
      if (b.tick - a.tick < 4) held++;
    }
    await page.screenshot({ path: join(out, 'ram.png') });
    const f = await feelNow(page);
    console.log(
      `ram: picture swung ${far.toFixed(2)} art px, the clock held in ${held} of 22 spans, buzzes ${f.buzzes.join(' ')} ms`,
    );
    await drive(page, IDLE);
    await roll(page, 40);
  }
  if (scene('blast')) {
    await page.evaluate(() => {
      const dd = window.__dd;
      window.__buzzes.length = 0;
      dd.put(0, 0, 0, 0, 0);
      dd.put(1, 700, 300);
    });
    await drive(page, IDLE);
    await roll(page, 30);
    await page.evaluate(() => {
      const dd = window.__dd;
      dd.dev.use(dd.home.x + 46, dd.home.y + 10, 'blast');
    });
    let far = 0;
    for (let i = 0; i < 18; i++) {
      await roll(page, 5);
      far = Math.max(far, (await feelNow(page)).off);
      if (i === 1) await page.screenshot({ path: join(out, 'blast.png') });
    }
    const f = await feelNow(page);
    console.log(`blast: picture swung ${far.toFixed(2)} art px, buzzes ${f.buzzes.join(' ')} ms`);
  }
  await page.close();
}

if (scene('pad')) {
  const page = await phone();
  await range(page);
  // the left stick pushed right, then the right trigger as a pedal with the stick steering
  await page.evaluate(() => window.__dd.put(0, -330, 0, 0, 0));
  const at = () =>
    page.evaluate(() => {
      const P = window.__dd.session.world.player;
      return { x: P.x, y: P.y, h: P.h };
    });
  const a = await at();
  await padIs(page, { axes: [1, 0, 0, 0] });
  await roll(page, 90);
  const b = await at();
  await padIs(page, { axes: [0.8, 0, 0, 0], values: { 7: 1 } });
  await roll(page, 60);
  const c = await at();
  console.log(
    `pad: stick drove the car ${Math.hypot(b.x - a.x, b.y - a.y).toFixed(0)} art px, ` +
      `trigger and stick turned it ${(c.h - b.h).toFixed(2)} rad`,
  );
  // START pauses; the stick and A open SETTINGS and the FEEL tab
  const press = async (o) => {
    await padIs(page, o);
    await roll(page, 2);
    await padIs(page, {});
    await roll(page, 2);
  };
  await press({ down: [9] });
  console.log(
    `pad: START ${(await page.evaluate(() => !document.getElementById('pauseMenu').classList.contains('hidden'))) ? 'paused the race' : 'DID NOT PAUSE'}`,
  );
  await press({ down: [13] });
  await page.screenshot({ path: join(out, 'pad-pause-menu.png') });
  /** Step the marker towards the button that says `text`, then press A. */
  const pick = async (text) => {
    for (let i = 0; i < 12; i++) {
      const to = await page.evaluate((text) => {
        const at = document.querySelector('.padAt');
        const want = [...document.querySelectorAll('section.screen:not(.hidden) button')].find(
          (b) => b.textContent.trim() === text && b.getBoundingClientRect().width > 0,
        );
        if (!at || !want) return null;
        const a = at.getBoundingClientRect();
        const b = want.getBoundingClientRect();
        return { on: at === want, dx: b.x + b.width / 2 - a.x - a.width / 2, dy: b.y - a.y };
      }, text);
      if (!to) break;
      if (to.on) return press({ down: [0] });
      const across = Math.abs(to.dx) > Math.abs(to.dy);
      await press({ down: [across ? (to.dx > 0 ? 15 : 14) : to.dy > 0 ? 13 : 12] });
    }
    console.log(`pad: never reached ${text}`);
  };
  await pick('SETTINGS');
  await pick('FEEL');
  // down to SCREEN SHAKE, and two steps up the slider
  await press({ down: [13] });
  await press({ down: [15] });
  await press({ down: [15] });
  await roll(page, 6);
  await page.screenshot({ path: join(out, 'pad-feel-settings.png') });
  console.log(
    `pad: FEEL tab ${(await page.evaluate(() => !document.querySelector('[data-pane=feel]').classList.contains('hidden'))) ? 'opened' : 'NOT OPENED'}, ` +
      `marker on "${await page.evaluate(() => document.querySelector('.padAt')?.closest('label')?.querySelector('span')?.textContent ?? document.querySelector('.padAt')?.textContent)}"`,
  );
  await page.close();
}

await browser.close();
server.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
