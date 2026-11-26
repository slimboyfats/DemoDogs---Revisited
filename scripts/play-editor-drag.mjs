// Track creator, the handles: serve the built client, open the editor at a phone's size in
// headless Chromium, and shape things by dragging them. A stretch of road is raised, made longer
// by an end, lifted by its tab, by a finger held on it, and with a mouse; a finger held on plain
// road raises a new stretch; a stretch of surface, a bridge, an area and a pool are resized by
// their handles. Screenshots go to captures/editor-drag/ (or the folder named), and with
// --frames a frame for each step of every drag, made into drag.mp4.
// The ground follows a raised stretch while the finger is still down, and that is checked too.
// Run with `pnpm play:drag` (it builds first). DPR=2 for sharper pictures.
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { readFile, mkdir, rm } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');

const root = new URL('../packages/client/dist/', import.meta.url).pathname;
const args = process.argv.slice(2);
const out = args.find((a) => !a.startsWith('--')) ?? 'captures/editor-drag';
const filming = args.includes('--frames');
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
if (filming) {
  await rm(`${out}/frames`, { recursive: true, force: true });
  await mkdir(`${out}/frames`, { recursive: true });
}

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 844, height: 390 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: Number(process.env.DPR) || 1,
});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const fail = (msg) => {
  console.error(`play-editor-drag: ${msg}`);
  process.exitCode = 1;
};
const check = (ok, msg) => ok || fail(msg);
const shot = async (name) => {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/${name}.png`, timeout: 180000 });
};
let frameNo = 0;
/** One frame of the clip (held for `hold` frames), when one is being made. */
const frame = async (hold = 1) => {
  if (!filming) return;
  await page.waitForTimeout(120);
  const shotAt = `${out}/frames/${String(frameNo++).padStart(4, '0')}.png`;
  await page.screenshot({ path: shotAt, timeout: 180000 });
  for (let k = 1; k < hold; k++)
    execFileSync('cp', [shotAt, `${out}/frames/${String(frameNo++).padStart(4, '0')}.png`]);
};
const tapSel = async (sel) => {
  const at = await page.evaluate((sel) => {
    const e = document.querySelector(sel);
    if (!e) return null;
    e.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = e.getBoundingClientRect();
    return [r.x + r.width / 2, r.y + r.height / 2];
  }, sel);
  if (!at) return fail(`nothing on the screen for ${sel}`);
  await page.touchscreen.tap(at[0], at[1]);
  await page.waitForTimeout(200);
};
const act = (what) => tapSel(`#editPanel [data-act="${what}"]`);
const MODE = { hand: 'hand', surface: 'road', raise: 'road', bridge: 'road', area: 'ground' };
const tool = async (t) => {
  await act(MODE[t]);
  if (await page.locator(`#editPanel .ctx [data-tool="${t}"]`).count())
    await tapSel(`#editPanel .ctx [data-tool="${t}"]`);
  check((await page.evaluate(() => window.__dd.editor.tool)) === t, `no ${t} tool`);
};
const track = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__dd.editor.track)));
/** Where a point of the map is on the screen, CSS px. */
const at = (x, y) =>
  page.evaluate(
    ([x, y]) => {
      const s = window.__dd.session;
      const v = window.__dd.view();
      const sq = Math.sin((56 * Math.PI) / 180);
      return [
        ((x - s.cam.x) * v.scale + v.w / 2) / v.dpr,
        ((y - s.cam.y) * v.scale * sq + v.h / 2) / v.dpr,
      ];
    },
    [x, y],
  );
const centre = async (x, y) => {
  await page.evaluate(([x, y]) => Object.assign(window.__dd.session.cam, { x, y }), [x, y]);
  await page.waitForTimeout(80);
};
/** A place on the road, a fraction of the lap round. */
const road = (f) =>
  page.evaluate((f) => {
    const T = window.__dd.session.world.track;
    const i = Math.floor(f * T.n);
    return [T.x[i], T.y[i]];
  }, f);
/** How high the ground stands at a place. */
const stands = (p) => page.evaluate(([x, y]) => window.__dd.session.world.relief?.at(x, y) ?? 0, p);
/** A handle of what is chosen, where it is on the screen (CSS px). */
const grip = async (name) => {
  const g = await page.evaluate((name) => {
    const k = window.__dd.view().dpr;
    const h = window.__dd.editor.grips().find((h) => h.grip === name);
    return h ? [h.x / k, h.y / k] : null;
  }, name);
  if (!g) fail(`what is chosen has no ${name} handle`);
  return g ?? [0, 0];
};
const cdp = await page.context().newCDPSession(page);
const finger = (type, p) =>
  cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: p ? [{ x: p[0], y: p[1] }] : [],
  });
/** Drag a finger across the screen (CSS px), resting on the spot first if asked to. */
const drag = async (a, b, { rest = 0, steps = 8, mid = null } = {}) => {
  const to = (k) => [a[0] + ((b[0] - a[0]) * k) / steps, a[1] + ((b[1] - a[1]) * k) / steps];
  if (rest) {
    await finger('touchStart', a);
    await page.waitForTimeout(rest);
    await frame();
    await finger('touchMove', to(1));
  } else {
    // a slow headless frame between the touch and its first move would count as resting the
    // finger: the two are sent together
    await Promise.all([finger('touchStart', a), finger('touchMove', to(1))]);
  }
  await frame();
  for (let k = 2; k <= steps; k++) {
    await finger('touchMove', to(k));
    await frame();
  }
  // (what the world shows while the finger is still down)
  if (mid) {
    await page.waitForTimeout(150);
    await mid();
  }
  await finger('touchEnd');
  // the world is built again from the track a moment after the finger lifts
  await page.waitForTimeout(100);
  await page.waitForFunction(() => window.__dd.editor.settled, null, { timeout: 120000 });
  await page.waitForTimeout(200);
  await frame(4);
};

// ---- a new track, close enough to see the road well
await page.goto(`${base}?autoplay&seed=7`);
await page.waitForTimeout(500);
await page.tap('#toTracks');
await page.tap('#newTrack');
await page.waitForFunction(
  () => window.__dd.screen === 'game' && document.body.classList.contains('editing'),
  null,
  { timeout: 90000 },
);
await act('fit');
await act('in');
await act('in');

// ---- raise a stretch, then drag its far end on down the road
let live = 0;
await tool('raise');
const [r0, r1, r2] = [await road(0.3), await road(0.36), await road(0.46)];
await centre(...(await road(0.38)));
await frame(3);
await drag(await at(...r0), await at(...r1));
let up = (await track()).raised;
check(up.length === 1 && up[0].height === 20, `no stretch was raised: ${JSON.stringify(up)}`);
await shot('1-raised-with-handles');
await drag(await grip('to'), await at(...r2), {
  mid: async () => (live = await stands(await road(0.42))),
});
check(live > 15, `the ground did not follow the end under the finger: it stood ${live}`);
up = (await track()).raised;
check(
  Math.hypot(up[0].x1 - r2[0], up[0].y1 - r2[1]) < 12 && up.length === 1,
  `the end did not follow the finger: ${JSON.stringify(up)} to ${r2}`,
);
check((await stands(await road(0.42))) > 15, 'the road past the old end was not raised');
await shot('2-end-dragged');
const before = await road(0.26);
await drag(await grip('from'), await at(...before));
check(
  Math.hypot((await track()).raised[0].x0 - before[0], (await track()).raised[0].y0 - before[1]) <
    12,
  'the near end did not follow the finger',
);

// ---- lift it by its tab: up the screen is higher
const tab = await grip('lift');
await drag(tab, [tab[0], tab[1] - 62], {
  steps: 10,
  mid: async () => (live = await stands(await road(0.36))),
});
check(Math.abs(live - 32) < 1, `the ground did not rise under the finger: it stood ${live}`);
check(
  (await track()).raised[0].height === 32,
  `the tab lifted it to ${(await track()).raised[0].height}`,
);
check(Math.abs((await stands(await road(0.36))) - 32) < 1, 'the ground did not rise with the tab');
await shot('3-lifted-by-the-tab');
// one step back puts it where it was, in one go
await act('undo');
check((await track()).raised[0].height === 20, 'UNDO did not take the lift back');
await act('redo');

// ---- a finger held on it, under MOVE, then down the screen: lower
await tool('hand');
const on = await at(...(await road(0.36)));
await drag(on, [on[0], on[1] + 42], { rest: 650 });
up = (await track()).raised;
check(up[0].height === 24, `holding and dragging down left it at ${up[0].height}`);
check((await page.evaluate(() => window.__dd.editor.tool)) === 'hand', 'the hold changed the tool');
await shot('4-held-and-lowered');

// ---- a finger held on plain road with RAISE out: a new stretch, lifted there and then
await tool('raise');
const plain = await road(0.14);
await centre(...plain);
const pl = await at(...plain);
await drag(pl, [pl[0], pl[1] - 42], { rest: 650 });
up = (await track()).raised;
check(up.length === 2 && up[1].height === 32, `held road was not raised: ${JSON.stringify(up)}`);
check((await stands(plain)) > 20, 'the held road does not stand up');
await shot('5-held-road-raised');

// ---- with a mouse: the same tab
const mt = await grip('lift');
await page.mouse.move(mt[0], mt[1]);
await page.mouse.down();
await page.mouse.move(mt[0], mt[1] + 40, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(400);
check(
  (await track()).raised[1].height === 24,
  `the mouse left it at ${(await track()).raised[1].height}`,
);

// ---- a stretch of surface by its end
await tool('surface');
await tapSel('#editTray .tile[data-id="material.ice"]');
const [s0, s1, s2] = [await road(0.74), await road(0.78), await road(0.84)];
await centre(...s1);
await drag(await at(...s0), await at(...s1));
await drag(await grip('to'), await at(...s2));
const sf = (await track()).surfaces;
check(
  sf.length === 1 && Math.hypot(sf[0].x1 - s2[0], sf[0].y1 - s2[1]) < 12,
  `the surface's end did not follow: ${JSON.stringify(sf)}`,
);
await shot('6-surface-end-dragged');

// ---- a bridge by its end
await tool('bridge');
const mid = await road(0.58);
await centre(...mid);
await page.touchscreen.tap(...(await at(...mid)));
await page.waitForTimeout(500);
const was = (await track()).bridges[0]?.length;
const step = await page.evaluate(() => window.__dd.session.world.track.step);
const lap = await page.evaluate(() => window.__dd.session.world.track.len);
await drag(await grip('to'), await at(...(await road(0.58 + 160 / lap))));
const span = (await track()).bridges[0]?.length;
check(
  was === 220 && Math.abs(span - 320) <= 20 + step * 2,
  `the bridge is ${span} long, was ${was}`,
);
await shot('7-bridge-end-dragged');

// ---- an area by its edge
await tool('area');
await tapSel('#editTray .tile[data-id="material.snow"]');
const t = await track();
const mapMid = [t.size.w / 2, t.size.h / 2];
await act('out');
await centre(...mapMid);
await page.touchscreen.tap(...(await at(...mapMid)));
await page.waitForTimeout(500);
const r0a = (await track()).areas[0]?.r;
const edge = await grip('edge');
await drag(edge, [edge[0] + 60, edge[1]]);
const r1a = (await track()).areas[0]?.r;
check(r1a > r0a + 20, `the area's edge did not follow: ${r0a} to ${r1a}`);
await shot('8-area-edge-dragged');

check(errors.length === 0, `page errors: ${errors.join(' | ')}`);
if (filming)
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-framerate',
    '8',
    '-i',
    `${out}/frames/%04d.png`,
    '-vf',
    'pad=ceil(iw/2)*2:ceil(ih/2)*2',
    '-pix_fmt',
    'yuv420p',
    `${out}/drag.mp4`,
  ]);
await browser.close();
server.close();
console.log(
  process.exitCode ? 'play-editor-drag: FAILED' : `play-editor-drag: ok, pictures in ${out}/`,
);
