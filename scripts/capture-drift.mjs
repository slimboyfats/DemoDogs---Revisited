// A lap with a rival at the wheel of your car, to see the drift: the sparks off the back wheels at
// each stage (pale, gold, blue), the burst when the brake is let go, and a hairpin taken sideways.
// `pnpm drift [out-dir] [venue] [--seconds=14] [--still] [--dpr=1] [--from=0.2]` (default
// captures/drift/, kennel-loop): frames f0000.png ... for ffmpeg, and a still of each stage.
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
const out = plain[0] ?? 'captures/drift';
const venue = plain[1] ?? 'kennel-loop';
const flag = (k, d) => Number(args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d);
const seconds = flag('seconds', 14);
const still = args.includes('--still');
await mkdir(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 844, height: 390 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: flag('dpr', 2),
});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${base}?start=${venue}&car=mutt&autoplay&seed=${flag('seed', 7)}&bloom=0`);
await page.waitForFunction(() => window.__dd?.session?.world.phase === 'race', null, {
  timeout: 180000,
});
await page.evaluate(() => {
  const s = window.__dd.session;
  s.rate = 0;
  Object.defineProperty(s.fx, 'quality', { get: () => 1, set() {} });
  for (const e of document.querySelectorAll('#overlay, #controls, #pauseBtn, #pauseKey'))
    e.style.visibility = 'hidden';
});
// run on unseen to where the clip starts (a part of a lap)
const from = flag('from', 0);
if (from > 0)
  await page.evaluate((from) => {
    const s = window.__dd.session;
    const w = s.world;
    const T = w.track;
    const at = () => T.s[w.player.idx] / T.len;
    // (the grid stands behind the line: over it first, then on to the place)
    for (let i = 0; i < 60 * 30 && at() > 0.5; i++) s.step();
    for (let i = 0; i < 60 * 120 && at() < from; i++) s.step();
  }, from);
let n = 0;
const shot = [];
if (still) {
  // each stage of a held drift, and the burst it pays: run on unseen to each, then look
  const wants = {
    'stage-0': (c) => c.drift !== 0 && c.charge > 0.35 && c.charge < 0.55,
    'stage-1': (c) => c.drift !== 0 && c.charge > 0.85 && c.charge < 1.2,
    burst: (c) => c.drift === 0 && c.charge === 0 && c.surge > 0.45 && c.surgeK > 1.1,
    'stage-2': (c) => c.drift !== 0 && c.charge > 1.45,
  };
  for (const [name, want] of Object.entries(wants)) {
    const got = await page.evaluate((src) => {
      const want = (0, eval)(`(${src})`);
      const s = window.__dd.session;
      const c = s.world.player;
      for (let i = 0; i < 60 * 240; i++) {
        s.step();
        if (want(c)) return true;
      }
      return false;
    }, String(want));
    if (!got) continue;
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/${venue}-${name}.png` });
    shot.push(name);
  }
} else {
  const ticks = Math.round(seconds * 60);
  for (let i = 0; i < ticks; i += 2) {
    await page.evaluate(() => {
      const s = window.__dd.session;
      s.step();
      s.step();
    });
    await page.waitForTimeout(40);
    await page.screenshot({ path: `${out}/f${String(n++).padStart(4, '0')}.png`, scale: 'css' });
  }
}
await browser.close();
server.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`${out}: ${n} frames, stills: ${shot.join(', ') || 'none'}`);
