// Track creator smoke test: serve the built client, open it at a phone landscape size in headless
// Chromium, and build a track by touch: bend the road, add a point, put things and a pool down
// from the tray, erase, undo, save the track as a JSON file, delete it, load the file back, reload
// the page, race it, and test drive it from the editor. Then the easier ways in: pinch and wheel
// zoom, a thing dragged off the tray, a road drawn with the pencil, a stretch of ice road. Screenshots go to captures/editor/ (or the folder named).
// Run with `pnpm play:editor` (it builds first). DPR=2 for sharper pictures.
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');

const root = new URL('../packages/client/dist/', import.meta.url).pathname;
const out = process.argv[2] ?? 'captures/editor';
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
const page = await browser.newPage({
  viewport: { width: 844, height: 390 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: Number(process.env.DPR) || 1,
  acceptDownloads: true,
});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const fail = (msg) => {
  console.error(`play-editor: ${msg}`);
  process.exitCode = 1;
};
const check = (ok, msg) => ok || fail(msg);
const shot = async (name) => {
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/${name}.png` });
};
const bar = (label) => page.locator('#editPanel button', { hasText: label }).first();
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
/** Slide the map so a point of it is in the middle of the screen, clear of the bar and the tray. */
const centre = async (x, y) => {
  await page.evaluate(([x, y]) => Object.assign(window.__dd.session.cam, { x, y }), [x, y]);
  await page.waitForTimeout(80);
};
const tapMap = async (x, y) => {
  await centre(x, y);
  await page.touchscreen.tap(...(await at(x, y)));
};
/** Tap a thing or a material in the tray. */
const pickTile = async (id) => {
  if (id.startsWith('prop.'))
    await page.locator('#editTray .chips button', { hasText: 'EVERYTHING' }).tap();
  await page.locator(`#editTray .tile[data-id="${id}"]`).tap();
};
const touch = (type, points) =>
  cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points.map(([x, y], id) => ({ x, y, id })),
  });
const zoomNow = () => page.evaluate(() => window.__dd.view().scale);
const cdp = await page.context().newCDPSession(page);
/** Drag a finger from one point of the map to another. */
const dragMap = async (x0, y0, x1, y1, mid) => {
  await centre((x0 + x1) / 2, (y0 + y1) / 2);
  const a = await at(x0, y0);
  const b = await at(x1, y1);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: a[0], y: a[1] }],
  });
  for (let k = 1; k <= 10; k++)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: a[0] + ((b[0] - a[0]) * k) / 10, y: a[1] + ((b[1] - a[1]) * k) / 10 }],
    });
  if (mid) await mid();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};
const inEditor = () =>
  page.waitForFunction(
    () => window.__dd.screen === 'game' && document.body.classList.contains('editing'),
    null,
    { timeout: 90000 },
  );

// ---- a new track
await page.goto(`${base}?autoplay&seed=7`);
await page.waitForTimeout(500);
await page.tap('#toTracks');
await shot('1-your-tracks');
await page.tap('#newTrack');
await inEditor();
await shot('2-new-track');
const t0 = await track();
check(t0.format === 'demodogs-track' && t0.road.points.length === 10, 'no new track in the editor');

// ---- the road: the whole map, drag a point, add a point
await bar('FIT').tap();
await shot('3-whole-map');
const [px, py] = t0.road.points[3];
await dragMap(px, py, px + 60, py + 200, () => shot('4-bending-the-road'));
await shot('5-road-bent');
const t1 = await track();
check(
  Math.abs(t1.road.points[3][0] - (px + 60)) < 12 &&
    Math.abs(t1.road.points[3][1] - (py + 200)) < 12,
  `the point did not follow the finger: ${t1.road.points[3]}`,
);
const sample = await page.evaluate(() => {
  const T = window.__dd.session.world.track;
  return T.n;
});
check(sample > 300, 'the world was not built again on the new road');
// between points 7 and 8, on the road
const mid = [(t1.road.points[7][0] + t1.road.points[8][0]) / 2, t1.road.points[7][1]];
await tapMap(mid[0], mid[1]);
await page.waitForTimeout(300);
const t2 = await track();
check(t2.road.points.length === 11, `tapping the road added no point (${t2.road.points.length})`);
await dragMap(...t2.road.points[8], t2.road.points[8][0], t2.road.points[8][1] - 150);
await shot('6-point-added');

// ---- things: a row of fuel drums beside the road, cones on it, one turned
await bar('+').tap();
await bar('+').tap();
await bar('THINGS').tap();
await pickTile('prop.oil-drum');
const c = [t2.size.w / 2, t2.size.h / 2];
for (let k = 0; k < 4; k++) await tapMap(c[0] - 60 + k * 40, c[1] + 40);
await pickTile('prop.cone');
const [rx, ry] = t2.road.points[0];
await tapMap(rx, ry + 60);
await page.waitForTimeout(200);
const t3 = await track();
check(t3.items.length === 5, `5 things put down, the track has ${t3.items.length}`);
const cone = t3.items[4];
const world = await page.evaluate(() => {
  const w = window.__dd.session.world;
  return {
    drums:
      w.props.filter((p) => p.def.id === 'prop.oil-drum').length +
      w.statics.filter((p) => p.def.id === 'prop.oil-drum').length,
  };
});
check(world.drums >= 4, 'the drums are not in the world');
check(
  Math.abs(Math.cos(cone.rot)) < 0.5,
  `a thing on the road should line up with it (rot ${cone.rot})`,
);
await bar('⟳').tap();
await page.waitForTimeout(300);
check(
  Math.abs((await track()).items[4].rot - cone.rot - Math.PI / 12) < 1e-6,
  'the turn button did not turn it',
);
// track pieces: a boost pad on the road, and a flock of animals that the world brings alive
await pickTile('prop.boost-pad');
await tapMap(rx, ry - 200);
await pickTile('prop.chickens');
await tapMap(c[0], c[1] - 60);
await page.waitForTimeout(300);
const pieces = await page.evaluate(() => {
  const w = window.__dd.session.world;
  return { pads: w.pads.length, critters: w.critters.length };
});
check(
  pieces.pads >= 1 && pieces.critters >= 1,
  `pad and animals not placed: ${JSON.stringify(pieces)}`,
);
await shot('7-things');

// ---- pools
await bar('POOLS').tap();
await pickTile('material.mud');
await tapMap(rx, ry - 120);
await pickTile('material.ice');
await tapMap(c[0] + 150, c[1] - 30);
await page.waitForTimeout(300);
const pools = await page.evaluate(() =>
  window.__dd.session.world.spills.filter((s) => s.fixed).map((s) => s.def.id),
);
check(pools.includes('material.mud') && pools.includes('material.ice'), `pools not laid: ${pools}`);
await shot('8-pools');

// ---- a bridge on the far side of the loop
await bar('BRIDGE').tap();
const far = (await track()).road.points[5];
await tapMap(far[0], far[1]);
await page.waitForTimeout(400);
const deck = await page.evaluate(() => {
  const w = window.__dd.session.world;
  return w.deckH ? Math.max(...w.deckH) : 0;
});
check((await track()).bridges.length === 1 && deck > 20, `no bridge went up (deck ${deck})`);
await shot('8b-bridge');

// ---- erase and undo
await bar('ERASE').tap();
await tapMap(c[0] - 60, c[1] + 40);
await page.waitForTimeout(300);
check((await track()).items.length === 6, 'erase did not take the drum away');
await shot('9-erase');
await bar('UNDO').tap();
await page.waitForTimeout(300);
check((await track()).items.length === 7, 'undo did not bring it back');

// ---- setup: name, laps, a rule off
await bar('SETUP').tap();
await page.fill('#editSetup input[type=text]', 'Drum Alley');
await page.dispatchEvent('#editSetup input[type=text]', 'change');
await shot('10-setup');
await page.locator('#editSetup button', { hasText: 'DONE' }).tap();
check((await track()).name === 'Drum Alley', 'the name was not taken');

// ---- the file: save, delete, load
await bar('FILE').tap();
await shot('11-file');
const [download] = await Promise.all([
  page.waitForEvent('download'),
  page.locator('#editSetup button', { hasText: 'SAVE AS A FILE' }).tap(),
]);
const file = `${out}/${download.suggestedFilename()}`;
await download.saveAs(file);
const saved = JSON.parse(await readFile(file, 'utf8'));
const now = await track();
check(
  download.suggestedFilename() === 'drum-alley.demodogs-track.json',
  'the file has the wrong name',
);
check(
  saved.format === 'demodogs-track' &&
    JSON.stringify(saved.road) === JSON.stringify(now.road) &&
    saved.items.length === 7 &&
    saved.pools.length === 2,
  'the file does not hold the track',
);
await page.locator('#editSetup button', { hasText: 'DONE' }).tap();
await bar('EXIT').tap();
await page.waitForTimeout(300);
check((await page.locator('.trackRow').count()) === 1, 'the track is not listed');
await shot('12-listed');
await page.locator('.trackRow button', { hasText: 'DELETE' }).tap();
await page.locator('.trackRow button', { hasText: 'SURE?' }).tap();
await page.waitForTimeout(200);
check((await page.locator('.trackRow').count()) === 0, 'delete did not delete');
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.tap('#loadTrack')]);
await chooser.setFiles(file);
await page.waitForTimeout(400);
check(
  (await page.locator('.trackRow b').first().textContent()) === 'DRUM ALLEY',
  'the file did not load',
);

// ---- it is still there after a reload; race it to the end
await page.reload();
await page.waitForTimeout(500);
await page.tap('#toTracks');
await page.waitForTimeout(300);
check((await page.locator('.trackRow').count()) === 1, 'the track did not survive a reload');
await page.locator('.trackRow button', { hasText: 'RACE' }).tap();
await page.waitForFunction(() => window.__dd.screen === 'game', null, { timeout: 90000 });
await page.waitForTimeout(6000);
await shot('13-racing');
const end = await page.evaluate(() => {
  const dd = window.__dd;
  const s = dd.session;
  for (let i = 0; i < 60 * 400 && s.world.phase !== 'over'; i++) s.step();
  dd.finish();
  return { phase: s.world.phase, screen: dd.screen, laps: s.world.laps, lap: s.world.player.lap };
});
check(
  end.phase === 'over' && end.screen === 'results',
  `the race did not finish: ${JSON.stringify(end)}`,
);
await shot('14-results');
await page.tap('#toMenu');

// ---- edit it again, test drive, and back to the editor
await page.tap('#toTracks');
await page.locator('.trackRow button', { hasText: 'EDIT' }).tap();
await inEditor();
check((await track()).items.length === 7, 'the saved track came back different');
await bar('TEST DRIVE').tap();
await page.waitForFunction(
  () => window.__dd.screen === 'game' && !document.body.classList.contains('editing'),
  null,
  { timeout: 90000 },
);
await page.waitForTimeout(5000);
await shot('15-test-drive');
await page.tap('#pauseBtn');
await page.tap('#quit');
await inEditor();
await shot('16-back-in-the-editor');

// ---- zoom: two fingers, then the wheel
await bar('FIT').tap();
const wide = await zoomNow();
await touch('touchStart', [
  [392, 200],
  [452, 200],
]);
for (let k = 1; k <= 8; k++)
  await touch('touchMove', [
    [392 - k * 12, 200],
    [452 + k * 12, 200],
  ]);
await touch('touchEnd', []);
await page.waitForTimeout(200);
const close = await zoomNow();
check(close > wide * 1.8, `two fingers did not zoom in (${wide} to ${close})`);
check((await track()).items.length === 7, 'a pinch put something down');
await shot('17-pinched-in');
await page.evaluate(() =>
  document
    .getElementById('editTap')
    .dispatchEvent(
      new WheelEvent('wheel', { deltaY: 300, clientX: 422, clientY: 200, cancelable: true }),
    ),
);
await page.waitForTimeout(200);
check((await zoomNow()) < close * 0.8, 'the wheel did not zoom out');

// ---- a thing dragged off the tray and let go on the map
await bar('THINGS').tap();
await page.locator('#editTray .chips button', { hasText: 'TRACK PIECES' }).tap();
await page.waitForTimeout(300);
const tile = await page.locator('#editTray .tile[data-id="prop.boost-pad"]').boundingBox();
const grab = [tile.x + tile.width / 2, tile.y + tile.height / 2];
await touch('touchStart', [grab]);
for (let k = 1; k <= 10; k++)
  await touch('touchMove', [
    [grab[0] + ((422 - grab[0]) * k) / 10, grab[1] + ((200 - grab[1]) * k) / 10],
  ]);
await shot('18-dragging-from-the-tray');
const drop = await page.evaluate(() => window.__dd.editor.toWorld(422, 200));
await touch('touchEnd', []);
await page.waitForTimeout(300);
const dropped = (await track()).items;
check(
  dropped.length === 8 &&
    dropped[7].prop === 'prop.boost-pad' &&
    Math.hypot(dropped[7].x - drop[0], dropped[7].y - drop[1]) < 3,
  `the thing dragged off the tray did not land: ${JSON.stringify(dropped[7])}`,
);
await shot('19-dropped');

// ---- a stretch of ice road
await bar('ROAD TYPE').tap();
await pickTile('material.ice');
const stretch = await page.evaluate(() => {
  const T = window.__dd.session.world.track;
  const p = (f) => [T.x[Math.floor(f * T.n)], T.y[Math.floor(f * T.n)]];
  return [p(0.12), p(0.2)];
});
await dragMap(...stretch[0], ...stretch[1], () => shot('20-laying-ice'));
await page.waitForTimeout(400);
const iced = await page.evaluate(() => {
  const w = window.__dd.session.world;
  return (w.roadSurface ?? []).filter((m) => m?.id === 'material.ice').length;
});
check((await track()).surfaces.length === 1 && iced > 5, `no ice road was laid (${iced} samples)`);
await shot('21-ice-road');

// ---- the pencil: a whole new road drawn with a finger
await bar('ROAD').tap();
await bar('FIT').tap();
await bar('PENCIL').tap();
const size = (await track()).size;
const loop = [];
for (let k = 0; k <= 60; k++) {
  const a = (k / 62) * Math.PI * 2;
  const r = 1 + 0.25 * Math.cos(a * 3);
  loop.push(
    await at(
      size.w / 2 + Math.cos(a) * size.w * 0.27 * r,
      size.h / 2 + Math.sin(a) * size.h * 0.25 * r,
    ),
  );
}
await touch('touchStart', [loop[0]]);
for (const p of loop.slice(1, 45)) await touch('touchMove', [p]);
await shot('22-drawing-the-road');
for (const p of loop.slice(45)) await touch('touchMove', [p]);
await touch('touchEnd', []);
await page.waitForTimeout(500);
const drawn = await page.evaluate(() => ({
  points: window.__dd.editor.track.road.points,
  problems: window.__dd.editor.problems,
}));
check(
  drawn.problems.length === 0 &&
    drawn.points.length >= 8 &&
    JSON.stringify(drawn.points) !== JSON.stringify(now.road.points),
  `the pencil drew no road: ${JSON.stringify(drawn)}`,
);
await shot('23-road-drawn');

// ---- terrain and weather: a snowfield where it snows, round the start line
await bar('TERRAIN').tap();
await page.locator('#editTray .tile[data-id="material.snow"]').tap();
await page.selectOption('#editPanel .row2 select', 'snow');
await bar('+').tap();
await tapMap(...drawn.points[0]);
await page.waitForTimeout(500);
const snowy = await page.evaluate(() => {
  const w = window.__dd.session.world;
  return {
    areas: window.__dd.editor.track.areas,
    fields: w.spills.filter((s) => s.fixed && s.r > 90).map((s) => s.def.id),
    weather: w.venue.weather,
  };
});
check(
  snowy.areas.length === 1 &&
    snowy.fields.includes('material.snow') &&
    snowy.weather?.[0]?.sky === 'snow',
  `no snowfield was laid: ${JSON.stringify(snowy)}`,
);
await shot('23b-snowfield');
await bar('TEST DRIVE').tap();
await page.waitForFunction(
  () => window.__dd.screen === 'game' && !document.body.classList.contains('editing'),
  null,
  { timeout: 90000 },
);
await page.waitForTimeout(8000);
await shot('24-driving-the-drawn-road');

if (errors.length) fail(`page errors:\n  ${errors.join('\n  ')}`);
await browser.close();
server.close();
if (!process.exitCode) console.log(`play-editor: ok (screenshots in ${out}/)`);
