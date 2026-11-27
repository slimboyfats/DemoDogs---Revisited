// Pool captures: a car driven off Cinder Peak's road into the lava beside it and out again (the
// lava flowing, the car alight, the speedometer saying so), and one over Frostbite Quarry's sheet
// ice, as frames for a clip and a few stills.
// `pnpm build && node scripts/capture-pools.mjs [out-dir] [--seconds=7] [--dpr=1] [--only=scene]
// [--dist=dir]` (default captures/pools/; scenes: lava, ice). Frames are <scene>-f0000.png ...
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const dist = flag('dist');
const root = dist ? `${dist}/` : new URL('../packages/client/dist/', import.meta.url).pathname;
const seconds = Number(flag('seconds') ?? 7);
const dpr = Number(flag('dpr') ?? 1);
const only = flag('only');
const out = args.find((a) => !a.startsWith('--')) ?? 'captures/pools';
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
await mkdir(out, { recursive: true });

// [scene, venue, where on the lap it starts, when (s) it leaves the road and comes back, how far out]
const SCENES = [
  ['lava', 'cinder-peak', 0.64, 1.6, 3.6, 112],
  ['ice', 'frostbite-quarry', 0.125, 9, 9, 0],
];
const browser = await chromium.launch();
const errors = [];
for (const [scene, venue, from, t1, t2, far] of SCENES) {
  if (only && only !== scene) continue;
  const page = await browser.newPage({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: dpr,
  });
  page.on('pageerror', (e) => errors.push(`${scene}: ${e}`));
  await page.goto(`${base}?start=${venue}&car=mutt&seed=7`);
  await page.waitForFunction(() => window.__dd?.session?.world.phase === 'race', null, {
    timeout: 180000,
  });
  await page.evaluate(
    ([from, t1, t2, far]) => {
      const s = window.__dd.session;
      const w = s.world;
      const T = w.track;
      const c = w.player;
      s.rate = 0;
      Object.defineProperty(s.fx, 'quality', { get: () => 1, set() {} });
      for (const e of document.querySelectorAll('#controls, #pauseBtn, #pauseKey'))
        e.style.visibility = 'hidden';
      w.placeOnTrack(c, Math.floor(from * T.n), 0);
      c.vx = Math.cos(c.h) * 120;
      c.vy = Math.sin(c.h) * 120;
      // the side of the road away from the middle of the lap (where the lava runs)
      let mx = 0;
      let my = 0;
      for (let i = 0; i < T.n; i++) {
        mx += T.x[i] / T.n;
        my += T.y[i] / T.n;
      }
      const i0 = c.idx;
      const out =
        Math.hypot(T.x[i0] - Math.sin(T.a[i0]) * 60 - mx, T.y[i0] + Math.cos(T.a[i0]) * 60 - my) >
        Math.hypot(T.x[i0] + Math.sin(T.a[i0]) * 60 - mx, T.y[i0] - Math.cos(T.a[i0]) * 60 - my)
          ? 1
          : -1;
      const t0 = w.time;
      s.o.input.read = () => {
        const t = w.time - t0;
        const o = t > t1 && t < t2 ? far * out : 0;
        const j = (c.idx + 9) % T.n;
        const tx = T.x[j] - Math.sin(T.a[j]) * o;
        const ty = T.y[j] + Math.cos(T.a[j]) * o;
        let d = Math.atan2(ty - c.y, tx - c.x) - c.h;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        return {
          steer: Math.max(-1, Math.min(1, d * 2.5)),
          throttle: 1,
          brake: false,
          boost: false,
          fire: false,
        };
      };
    },
    [from, t1, t2, far],
  );
  const ticks = Math.round(seconds * 60);
  const stills = [0.3, 0.42, 0.56, 0.7].map((f) => Math.round((ticks * f) / 2) * 2);
  let n = 0;
  for (let i = 0; i < ticks; i += 2) {
    await page.evaluate(() => {
      const s = window.__dd.session;
      s.step();
      s.step();
    });
    await page.waitForTimeout(40);
    await page.screenshot({
      path: `${out}/${scene}-f${String(n++).padStart(4, '0')}.png`,
      scale: 'css',
    });
    if (stills.includes(i)) {
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${out}/${scene}-${stills.indexOf(i) + 1}.png` });
    }
  }
  await page.close();
}
await browser.close();
server.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`pool captures in ${out}/`);
