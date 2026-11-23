// World modifier captures: the same race under each modifier, in headless Chromium at a phone
// landscape size (844x390, dpr 2), one shot each in captures/world/ (or the folder named).
// `pnpm build && node scripts/capture-world.mjs [out-dir] [modifier ...]`
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
const out = process.argv[2] ?? 'captures/world';
await mkdir(out, { recursive: true });

// each modifier: the venue it shows best on, when to look (a test on the world w, the player's
// car P, the modifier m, near(x, y, d) and the weather effects fx), and how many ticks later to take the shot
const ALL = {
  downpour: ['kennel-loop', 'w.spills.some((p) => !p.fixed && near(p.x, p.y, 90))', 0],
  gale: ['knotwood', 'm.gusting && m.gustT > 1.5 && w.time > 12', 30],
  thunderheads: ['pinewood-sprint', 'fx.bolts.some((b) => b.age < 2 && near(b.x, b.y, 100))', 1],
  'lights-out': ['kennel-loop', 'w.time > 9', 0],
  'moon-bounce': ['gravel-gulch', 'w.cars.some((c) => c.z > 2 && near(c.x, c.y, 90))', 0],
  tremors: ['brickworks', 'm.shakeT > 0 && near(m.qx, m.qy, 120)', 30],
  'high-water': ['kennel-loop', 'm.pools.some((p) => p.r > 34 && near(p.x, p.y, 80))', 0],
  scrapfall: ['scrapyard-run', 'm.pending.some((p) => near(p.x, p.y, 120) && p.t < 0.02)', 8],
  greased: ['kennel-loop', 'w.spills.some((p) => !p.fixed && near(p.x, p.y, 60))', 0],
  tinderbox: ['pinewood-sprint', 'w.blazes.filter((b) => near(b.x, b.y, 70)).length > 2', 10],
};
// FRAMES=<n> records n frames (two ticks each) from that moment into <out>/<name>/ instead
const frames = Number(process.env.FRAMES ?? 0);
const names = process.argv.length > 3 ? process.argv.slice(3) : Object.keys(ALL);

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 844, height: 390 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: Number(process.env.DPR ?? 2),
});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
// run the race to tick `to` unseen, or (to < 0) until `when` holds; returns the tick reached
const run = (when, to) =>
  page.evaluate(
    ([when, to]) => {
      const s = window.__dd.session;
      const w = s.world;
      const P = w.player;
      const near = (x, y, d) => Math.hypot(x - P.x, y - P.y) < d;
      const test = new Function('w', 'P', 'm', 'near', 'fx', `return ${when}`);
      s.rate = 0; // the shots step the race by hand
      let n = 0;
      while (
        to < 0
          ? n < 60 * 150 && !(w.phase === 'race' && test(w, P, w.mods[0], near, s.fx.weather))
          : n < to
      ) {
        s.step();
        n++;
      }
      return n;
    },
    [when, to],
  );
// step n ticks and draw the frame, as the game would
const frame = (n) =>
  page.evaluate((n) => {
    const s = window.__dd.session;
    for (let i = 0; i < n; i++) s.step();
    return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, n);
const LEAD = 120;

for (const name of names) {
  const [venue, when, after] = ALL[name] ?? ['kennel-loop', 'w.time > 12', 0];
  const url = `${base}?start=${venue}&car=mutt&autoplay&seed=7&mods=${name}`;
  const ready = () =>
    page.waitForFunction(() => window.__dd?.screen === 'game', null, { timeout: 120000 });
  // find the moment, then play the same race again and draw the frames that lead up to it:
  // fire and smoke only move in frames that are drawn
  await page.goto(url);
  await ready();
  const at = await run(when, -1);
  await page.goto(url);
  await ready();
  await run('', Math.max(0, at - LEAD));
  for (let i = 0; i < Math.min(LEAD, at) / 2; i++) await frame(2);
  if (frames) {
    await mkdir(`${out}/${name}`, { recursive: true });
    for (let i = 0; i < frames; i++) {
      await frame(2);
      await page.screenshot({
        path: `${out}/${name}/f${String(i).padStart(4, '0')}.jpg`,
        type: 'jpeg',
        quality: 92,
      });
    }
  } else {
    for (let i = 0; i < after; i++) await frame(1);
    await page.screenshot({ path: `${out}/${name}.png` });
  }
  console.log(name, `at ${(at / 60).toFixed(1)} s`);
}
await browser.close();
server.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
