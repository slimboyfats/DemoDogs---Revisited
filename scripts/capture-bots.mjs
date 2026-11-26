// A clip of a race driven by bots alone (your own car on autopilot too), in headless Chromium at
// 844x390 dpr 2 with the camera wide, to see how the rival drivers drive: a frame every sixth
// tick, and an mp4 with ffmpeg. (Headless drawing is slow: allow about a minute for each second.)
//
//   pnpm build && node scripts/capture-bots.mjs [out-dir] [--venue=kennel-loop] [--seed=7]
//       [--from=4] [--seconds=30] [--rivals=normal] [--dist=packages/client/dist] [--name=race]
//       [--dpr=2] [--zoom=wide]
//
// `--dist` points at another build of the client (an older checkout's, to film a before).
import { createServer } from 'node:http';
import { readFile, mkdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { extname, join, normalize, resolve } from 'node:path';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');

const args = process.argv.slice(2);
const flag = (name, or) =>
  args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? or;
const out = args.find((a) => !a.startsWith('--')) ?? 'captures/bots';
const root = resolve(flag('dist', new URL('../packages/client/dist/', import.meta.url).pathname));
const venue = flag('venue', 'kennel-loop');
const name = flag('name', venue);
const seconds = Number(flag('seconds', 30));
const from = Number(flag('from', 4));

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

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 844, height: 390 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: Number(flag('dpr', 2)),
});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(
  `${base}?start=${venue}&car=mutt&autoplay&seed=${flag('seed', 7)}&zoom=${flag('zoom', 'wide')}&bloom=0` +
    `&rivals=${flag('rivals', 'normal')}`,
);
await page.waitForFunction(() => window.__dd?.screen === 'game', null, { timeout: 120000 });
// from here the script runs the race itself, six ticks a frame
const step = (n) =>
  page.evaluate(async (n) => {
    const s = window.__dd.session;
    s.rate = 0;
    for (let i = 0; i < n; i++) s.step();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, n);
// the countdown and the first seconds, unfilmed
for (let t = 0; t < (3.6 + from) * 60; t += 30) await step(30);
const dir = `${out}/${name}-frames`;
await rm(dir, { recursive: true, force: true });
await mkdir(dir, { recursive: true });
for (let i = 0; i < seconds * 10; i++) {
  await step(6);
  await page.screenshot({ path: `${dir}/${String(i).padStart(4, '0')}.png`, timeout: 180000 });
}
const stats = await page.evaluate(() => {
  const w = window.__dd.session.world;
  return w.cars.map((c) => ({
    name: c.name,
    kind: c.ai?.style ?? '',
    laps: +(c.progress / w.track.len).toFixed(2),
  }));
});
console.table(stats);
execFileSync('ffmpeg', [
  '-y',
  '-loglevel',
  'error',
  '-framerate',
  '10',
  '-i',
  `${dir}/%04d.png`,
  '-vf',
  'scale=1266:-2',
  '-pix_fmt',
  'yuv420p',
  '-crf',
  '26',
  `${out}/${name}.mp4`,
]);
await rm(dir, { recursive: true, force: true });
await browser.close();
server.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`${out}/${name}.mp4`);
