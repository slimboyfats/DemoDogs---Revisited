// A night chase to judge the feel by: the player weaves off the road and back with the rivals
// racing round it, under a dark sky, so the beams swinging with the cars, the tail lamps' pools,
// the tracks left in soft ground and what the wheels throw up are all in one clip.
// `pnpm chase [out-dir] [venue] [sky] [--seconds=8] [--still] [--dpr=1]` (default captures/chase/,
// frostbite-quarry, snow-night): frames f0000.png ... for ffmpeg, and three stills.
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
const out = plain[0] ?? 'captures/chase';
const venue = plain[1] ?? 'frostbite-quarry';
const sky = plain[2] ?? 'snow-night';
const seconds = Number(args.find((a) => a.startsWith('--seconds='))?.slice(10) ?? 8);
const still = args.includes('--still');
await mkdir(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 844, height: 390 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: Number(args.find((a) => a.startsWith('--dpr='))?.slice(6) ?? 2),
});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${base}?start=${venue}&car=mutt&seed=7`);
await page.waitForFunction(() => window.__dd?.session?.world.phase === 'race', null, {
  timeout: 180000,
});
await page.evaluate((sky) => {
  const dd = window.__dd;
  const s = dd.session;
  const w = s.world;
  const T = w.track;
  s.rate = 0;
  Object.defineProperty(s.fx, 'quality', { get: () => 1, set() {} });
  for (const e of document.querySelectorAll('#overlay, #controls, #pauseBtn, #pauseKey'))
    e.style.visibility = 'hidden';
  dd.sky.set(sky, true);
  dd.sky.state.snap();
  // weave: out over the verge and back, braking into each turn back so the tail steps out
  s.o.input.read = () => {
    const c = w.player;
    const t = w.time;
    const side = Math.sin(t * 1.3) * (w.road * 0.5 + 34);
    const k = (c.idx + 9) % T.n;
    const a = T.a[k];
    const want =
      Math.atan2(T.y[k] + Math.cos(a) * side - c.y, T.x[k] - Math.sin(a) * side - c.x) - c.h;
    return {
      steer: Math.max(-1, Math.min(1, Math.atan2(Math.sin(want), Math.cos(want)) * 2.5)),
      throttle: 1,
      brake: Math.sin(t * 2.6) > 0.9,
      boost: false,
      fire: false,
    };
  };
}, sky);
let n = 0;
const ticks = Math.round(seconds * 60);
for (let i = 0; i < ticks; i += 2) {
  await page.evaluate(() => {
    const s = window.__dd.session;
    s.step();
    s.step();
  });
  await page.waitForTimeout(still ? 10 : 40);
  if (!still)
    await page.screenshot({ path: `${out}/f${String(n++).padStart(4, '0')}.png`, scale: 'css' });
  if (i === Math.round(ticks / 3 / 2) * 2 || i === Math.round((ticks * 2) / 3 / 2) * 2) {
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/${venue}-${sky}-${i}.png` });
  }
}
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/${venue}-${sky}-end.png` });
await browser.close();
server.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`${out}: ${n} frames`);
