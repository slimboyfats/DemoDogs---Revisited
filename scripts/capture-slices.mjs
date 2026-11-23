// Slice effects, staged on the test range in headless Chromium at 844x390 dpr 2 (see
// packages/client/src/render/slice-fx.ts): props, towers and a car going up slice by slice
// (`build/`, stills `build-N.png`), and tall scenery seen through as the car passes behind it
// (`through/`, `through-on.png` beside `through-off.png`). A frame every 40 ms of the slice clock;
// `--video` makes an mp4 of each with ffmpeg.
// Run with `pnpm build && node scripts/capture-slices.mjs [out-dir] [--video] [--only=build|through]`.
import { createServer } from 'node:http';
import { readFile, mkdir, copyFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
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
const video = args.includes('--video');
// --only=build or through: just that part
const only = args.find((a) => a.startsWith('--only='))?.slice(7);
const out = args.find((a) => !a.startsWith('--')) ?? 'captures/slices';
await mkdir(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 844, height: 390 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

/** The test range with time stopped, the panel hidden and the ground round the car cleared. */
const range = async (query = '') => {
  await page.goto(`${base}?dev&car=mutt&bloom=0${query}`);
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    const dd = window.__dd;
    dd.dev.setRate(0);
    document.getElementById('devPanel').style.visibility = 'hidden';
    const w = dd.session.world;
    for (const c of w.cars) c.ai = null;
    for (const p of w.props) p.alive = false;
    const P = w.player;
    for (const s of w.statics) if (Math.hypot(s.x - P.x, s.y - P.y) < 300) s.down = true;
    w.critters.length = 0;
    dd.put = (id, dx, dy) => {
      dd.dev.propSel.value = `prop.${id}`;
      dd.dev.use(P.x + dx, P.y + dy, 'prop');
    };
  });
};
const frames = (n) =>
  page.evaluate(async (n) => {
    for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(r));
  }, n);

// the things that go up: [prop, east, south] of the car
const TALL = [
  ['tower-glass', 0, 34],
  ['water-tower', -58, 30],
  ['scrap-tower-tall', 56, 30],
];

// from here the script moves the slice clock itself, a step a shot, so every run shows the same
const hold = () =>
  page.evaluate(() => {
    const fx = window.__dd.session.fx.slices;
    const real = fx.frame.bind(fx);
    fx.frame = () => {};
    window.__dd.tick = (dt) => real(window.__dd.session.world, dt);
  });
const tick = async (dt) => {
  await page.evaluate((dt) => window.__dd.tick(dt), dt);
  await frames(2);
};
const film = async (name, n, each) => {
  const dir = `${out}/${name}`;
  await mkdir(dir, { recursive: true });
  for (let i = 0; i < n; i++) {
    await each(i);
    await page.screenshot({ path: `${dir}/${String(i).padStart(3, '0')}.png` });
  }
  if (video)
    execFileSync('ffmpeg', [
      '-y',
      '-loglevel',
      'error',
      '-framerate',
      '25',
      '-i',
      `${dir}/%03d.png`,
      '-vf',
      'scale=1688:-2:flags=neighbor',
      '-pix_fmt',
      'yuv420p',
      `${out}/${name}.mp4`,
    ]);
};

if (!only || only === 'build') {
  // things going up slice by slice, and a car put back together as after a wreck
  await range();
  await hold();
  await page.evaluate((list) => {
    const dd = window.__dd;
    for (const [id, dx, dy] of list) dd.put(id, dx, dy - 70);
    dd.put('crate', -20, -24);
    dd.put('oil-drum', 22, -24);
    dd.tick(0);
    const P = dd.session.world.player;
    dd.session.fx.slices.start(P, P.z);
  }, TALL);
  await film('build', 60, () => tick(0.04));
  for (const [i, name] of [
    [5, 'build-1'],
    [14, 'build-2'],
    [28, 'build-3'],
    [44, 'build-4'],
  ])
    await copyFile(`${out}/build/${String(i).padStart(3, '0')}.png`, `${out}/${name}.png`);
}

// driving past behind three tall things: each turns see-through above the car, then fills in.
// `through-off.png` is the same moment with the effect off (`?slices=0`).
if (!only || only === 'through') {
  for (const [name, query] of [
    ['through-off', '&slices=0'],
    ['through-on', ''],
  ]) {
    await range(query);
    await page.evaluate((list) => {
      for (const [id, dx, dy] of list) window.__dd.put(id, dx, dy);
    }, TALL);
    await frames(40);
    await page.screenshot({ path: `${out}/${name}.png` });
  }
  await range();
  await hold();
  await page.evaluate((list) => {
    const dd = window.__dd;
    for (const [id, dx, dy] of list) dd.put(id, dx, dy);
    dd.tick(0);
    dd.tick(3);
    const P = dd.session.world.player;
    dd.home = { x: P.x, y: P.y };
  }, TALL);
  await film('through', 80, async (i) => {
    await page.evaluate((x) => {
      const dd = window.__dd;
      dd.session.world.player.x = dd.home.x - 100 + x;
    }, i * 2.5);
    await tick(0.04);
  });
}

if (errors.length) console.log(`page errors:\n  ${errors.join('\n  ')}`);
await browser.close();
server.close();
