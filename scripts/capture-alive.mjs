// What goes on round a race: a camera set down beside the road at points of a venue, the world
// run on by its own clock, and a still (or the frames of a clip) of what passes: a train over its
// crossing, ducks in a file, fans at the rail, balloons, what flies over.
// `pnpm build && node scripts/capture-alive.mjs [out-dir] [venue] [--at=0.28,0.93] [--wait=4]
// [--seconds=0] [--shots=1 --gap=0.6] [--zoom=1] [--until=prop.id]` (default captures/alive/, kennel-loop). A spot is a fraction of the
// way round, x:y on the map, @prop.id for a thing of that kind, or `lap` for the line as the driver ends a lap. --wait runs the race on that long before the still (--shots of
// them, --gap seconds apart); --seconds
// films that long from there (frames to <out>/<venue>-<n>/, and an mp4 if ffmpeg is about).
import { createServer } from 'node:http';
import { readFile, mkdir, rm } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const { chromium } = createRequire(import.meta.url)('playwright');
const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
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
const rest = args.filter((a) => !a.startsWith('--'));
const out = rest[0] ?? 'captures/alive';
const venue = rest[1] ?? 'kennel-loop';
const spots = (flag('at') ?? '0.28').split(',');
const wait = Number(flag('wait') ?? 4);
const seconds = Number(flag('seconds') ?? 0);
const zoom = Number(flag('zoom') ?? 1);
const shots = Number(flag('shots') ?? 1);
const gap = Number(flag('gap') ?? 0.6);
const more = flag('query') ?? '';
await mkdir(out, { recursive: true });

const browser = await chromium.launch();
const errors = [];
const page = await browser.newPage({
  viewport: { width: 844, height: 390 },
  deviceScaleFactor: seconds ? 1 : 2,
  hasTouch: true,
});
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${base}?start=${venue}&car=mutt&autoplay&seed=7${more ? `&${more}` : ''}`);
await page.waitForFunction(() => window.__dd?.session?.ground, null, { timeout: 180000 });
await page.waitForTimeout(3000);
await page.evaluate((zoom) => {
  const dd = window.__dd;
  const s = dd.session;
  Object.defineProperty(s.fx, 'quality', { get: () => 1, set() {} });
  // the race gets under way, then the clock is ours
  for (let i = 0; i < 60 * 5; i++) s.step();
  s.advance = () => false;
  s.follow = false;
  if (zoom !== 1) dd.overview(dd.view().scale * zoom);
  for (const e of document.querySelectorAll('#hud, .hud, #touch, .touch, #pauseBtn, #controls'))
    e.style.visibility = 'hidden';
}, zoom);

const settle = () =>
  page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(0)))),
  );
for (let n = 0; n < spots.length; n++) {
  await page.evaluate(
    ([spot, ticks, until]) => {
      const s = window.__dd.session;
      const w = s.world;
      const T = w.track;
      if (spot[0] === '@' || spot === 'lap') {
        // (looked up once the clock has run)
      } else if (spot.includes(':')) [s.cam.x, s.cam.y] = spot.split(':').map(Number);
      else {
        const k = T ? Math.floor(Number(spot) * T.n) % T.n : 0;
        s.cam.x = T ? T.x[k] : w.w / 2;
        s.cam.y = T ? T.y[k] : w.h / 2;
      }
      for (let i = 0; i < ticks; i++) s.step();
      // (and on until a traveller of that kind sets out, so a clip opens as the train comes)
      const out = () => w.critters.some((c) => c.def.id === until && !c.gone);
      if (until) {
        for (let i = 0; i < 60 * 60 && out(); i++) s.step();
        for (let i = 0; i < 60 * 60 && !out(); i++) s.step();
      }
      if (spot === 'lap') {
        // (the moment the driver's car ends a lap: paper in the air over the line)
        const lap = w.player.lap;
        for (let i = 0; i < 60 * 150 && w.player.lap === lap; i++) s.step();
        for (let i = 0; i < 28; i++) s.step();
        [s.cam.x, s.cam.y] = [w.player.x, w.player.y];
      }
      if (spot[0] === '@') {
        // (a thing by its id: the first traveller of that kind out on its way, else one standing)
        const id = spot.slice(1);
        const k =
          w.critters.find((c) => c.def.id === id && !c.gone) ??
          w.statics.find((c) => c.def.id === id);
        // (and a moment more with the camera on it, for what it gives off only when watched)
        for (let i = 0; i < 100 && k; i++) {
          [s.cam.x, s.cam.y] = [k.x, k.y];
          s.step();
        }
      }
    },
    [spots[n], Math.round(wait * 60), flag('until')],
  );
  await page.waitForTimeout(1500);
  if (!seconds) {
    for (let k = 0; k < shots; k++) {
      if (k) {
        await page.evaluate(
          (ticks) => {
            for (let i = 0; i < ticks; i++) window.__dd.session.step();
          },
          Math.round(gap * 60),
        );
        await page.waitForTimeout(700);
      }
      const name = shots > 1 ? `${venue}-${n + 1}-${k + 1}` : `${venue}-${n + 1}`;
      await page.screenshot({ path: `${out}/${name}.png`, timeout: 240000 });
    }
    continue;
  }
  const dir = `${out}/${venue}-${n + 1}`;
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  // thirty frames a second: two ticks to the frame
  const frames = Math.round(seconds * 30);
  for (let f = 0; f < frames; f++) {
    await page.evaluate(() => {
      const s = window.__dd.session;
      s.step();
      s.step();
    });
    await settle();
    await page.screenshot({
      path: `${dir}/${String(f).padStart(4, '0')}.png`,
      timeout: 240000,
    });
  }
  spawnSync(
    'ffmpeg',
    [
      '-y',
      '-framerate',
      '30',
      '-i',
      `${dir}/%04d.png`,
      '-pix_fmt',
      'yuv420p',
      '-crf',
      '20',
      `${dir}.mp4`,
    ],
    { stdio: 'ignore' },
  );
}
await browser.close();
server.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`captures in ${out}/`);
