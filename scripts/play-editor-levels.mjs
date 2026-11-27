// Track creator, raised road in levels: serve the built client, open the editor at a phone's size
// in headless Chromium, raise a stretch of road and shape it by touch. It is split into levels,
// each lifted by its own tab; the place where a level begins is dragged along the road; the slope
// at each end is made steep and gentle by its handle; and its edges are walled, left open, and
// given ramps on one side only. The ground is checked to follow while the finger is still down.
// Screenshots go to captures/editor-levels/ (or the folder named), and with --frames a frame for
// each step of every drag, made into levels.mp4.
// Run with `pnpm play:levels` (it builds first). DPR=2 for sharper pictures.
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { readFile, mkdir, rm } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');

const root = new URL('../packages/client/dist/', import.meta.url).pathname;
const args = process.argv.slice(2);
const out = args.find((a) => !a.startsWith('--')) ?? 'captures/editor-levels';
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
  console.error(`play-editor-levels: ${msg}`);
  process.exitCode = 1;
};
const check = (ok, msg) => ok || fail(msg);
const shot = async (name) => {
  if (globalThis.look) await globalThis.look();
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
const grip = async (name, part) => {
  const g = await page.evaluate(
    ([name, part]) => {
      const k = window.__dd.view().dpr;
      const h = window.__dd.editor
        .grips()
        .find((h) => h.grip === name && (part === null || h.part === part));
      return h ? [h.x / k, h.y / k] : null;
    },
    [name, part ?? null],
  );
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
  // (a drag near the edge slides the map: it is put back on the stretch for the next one)
  if (globalThis.look) await globalThis.look();
  await frame(4);
};

const press = (label) => tapSel(`#editPanel .ctx button[aria-label^="${label}"]`);
const built = async () => {
  await page.waitForTimeout(150);
  await page.waitForFunction(() => window.__dd.editor.settled, null, { timeout: 120000 });
  await page.waitForTimeout(200);
  await frame(5);
};
const statics = (id) =>
  page.evaluate((id) => {
    const w = window.__dd.session.world;
    // (only what stands up on raised road: the track's own trackside is armco too)
    return w.statics.filter((s) => s.def.id === id && !s.down && w.relief.at(s.x, s.y) > 5).length;
  }, id);

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

// (the stretch a little below the middle: its height tabs stand above it, clear of the top bar)
globalThis.look = async () => {
  const [x, y] = await road(0.4);
  await centre(x, y - 30);
};

// ---- raise a long stretch
let live = 0;
await tool('raise');
await globalThis.look();
await frame(3);
await drag(await at(...(await road(0.28))), await at(...(await road(0.52))));
let up = (await track()).raised;
check(up.length === 1 && up[0].height === 20, `no stretch was raised: ${JSON.stringify(up)}`);
await shot('1-raised');

// ---- split it in two, and lift the second level by its own tab
await press('ADD LEVEL');
await built();
up = (await track()).raised;
check(up[0].levels?.length === 1, `ADD LEVEL added none: ${JSON.stringify(up)}`);
let tab = await grip('lift', 1);
await drag(tab, [tab[0], tab[1] - 62], {
  steps: 10,
  mid: async () => (live = await stands(await road(0.44))),
});
up = (await track()).raised;
check(up[0].levels[0].height === 40, `the second level stands ${up[0].levels[0].height}`);
check(Math.abs(live - 40) < 1.5, `the ground did not follow the tab: it stood ${live}`);
check(Math.abs((await stands(await road(0.33))) - 20) < 1.5, 'the first level did not stay put');
await shot('2-two-levels');

// ---- drag the place where the second level begins back along the road
const cut = await road(0.36);
await drag(await grip('level', 1), await at(...cut), {
  mid: async () => (live = await stands(await road(0.4))),
});
up = (await track()).raised;
check(
  Math.hypot(up[0].levels[0].x - cut[0], up[0].levels[0].y - cut[1]) < 12,
  `the step did not follow the finger: ${JSON.stringify(up[0].levels)}`,
);
check(live > 36, `the ground did not follow the step under the finger: it stood ${live}`);
await shot('3-step-dragged');

// ---- a third level, lower: tap ADD LEVEL on the second, pull the new tab down
await press('ADD LEVEL');
await built();
tab = await grip('lift', 2);
await drag(tab, [tab[0], tab[1] + 122], { steps: 10 });
up = (await track()).raised;
check(
  up[0].levels.length === 2 && up[0].levels[1].height === 24,
  `the third level: ${JSON.stringify(up[0].levels)}`,
);
await shot('4-three-levels');

// ---- the slope at each end: steep where the road climbs on, gentle where it comes down
const lap = await page.evaluate(() => window.__dd.session.world.track.len);
await drag(await grip('rampIn'), await at(...(await road(0.28))));
/** The road `back` px before where the stretch ends. */
const before = (back) =>
  page.evaluate((back) => {
    const T = window.__dd.session.world.track;
    const r = window.__dd.editor.track.raised[0];
    let end = 0;
    let bd = Infinity;
    for (let i = 0; i < T.n; i++) {
      const d = (T.x[i] - r.x1) ** 2 + (T.y[i] - r.y1) ** 2;
      if (d < bd) [bd, end] = [d, i];
    }
    const i = (end - Math.round(back / T.step) + T.n) % T.n;
    return [T.x[i], T.y[i]];
  }, back);
await drag(await grip('rampOut'), await at(...(await before(200))), {
  mid: async () => (live = await stands(await before(100))),
});
up = (await track()).raised;
check(up[0].rampIn <= 40, `the first slope is ${up[0].rampIn} long`);
check(Math.abs(up[0].rampOut - 200) <= 16, `the last slope is ${up[0].rampOut} long`);
check(live > 6 && live < 18, `half way down the long slope the ground stood ${live}`);
check((await stands(await road(0.28 + 48 / lap))) > 18, 'the steep slope is not steep');
await shot('5-steep-and-gentle');

// ---- walls along its edges: no rails, no ramps beside it
const rails = await statics('prop.armco');
check(rails > 20, `it was not railed to begin with: ${rails}`);
await press('EDGES');
await built();
up = (await track()).raised;
check(up[0].edge === 'wall', `EDGES did not wall it: ${up[0].edge}`);
check((await statics('prop.road-wall')) > 40, 'no walls stand along it');
check((await statics('prop.armco')) === 0, 'rails still stand along it');
check(
  await page.evaluate(() => !window.__dd.session.world.relief.slip),
  'a walled stretch still has ramps beside it',
);
await shot('6-walled');

// ---- open edges, and ramps on one side only
await press('EDGES');
await built();
check((await track()).raised[0].edge === 'open', 'EDGES did not open it');
check((await statics('prop.road-wall')) + (await statics('prop.armco')) === 0, 'open, yet railed');
await press('SIDE RAMPS');
await built();
check((await track()).raised[0].lanes === 'left', 'SIDE RAMPS did not go to one side');
await shot('7-open-ramps-one-side');
await press('EDGES');
await built();
check((await track()).raised[0].edge === undefined, 'EDGES did not come back round to rails');

// ---- joined back up, one level at a time
await press('JOIN');
await built();
await press('JOIN');
await built();
check(!(await track()).raised[0].levels, 'JOIN left levels behind');
await act('undo');
await act('undo');
await act('undo');
await act('undo');
await act('undo');
await built();
up = (await track()).raised;
check(up[0].edge === 'wall' && up[0].levels?.length === 2, `UNDO: ${JSON.stringify(up[0])}`);
await globalThis.look();
await page.touchscreen.tap(...(await at(...(await road(0.4)))));
await page.waitForTimeout(400);
await shot('8-walled-in-three-levels');

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
    `${out}/levels.mp4`,
  ]);
await browser.close();
server.close();
console.log(
  process.exitCode ? 'play-editor-levels: FAILED' : `play-editor-levels: ok, pictures in ${out}/`,
);
