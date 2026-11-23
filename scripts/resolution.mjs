// Resolution bench: the same race at each resolution step (see packages/client/src/game/
// resolution.ts), on a phone-sized screen in headless Chromium. Prints the canvas size, the time
// a frame takes and the frames a second, and saves a shot of each (captures/resolution/).
// Run with `pnpm build && node scripts/resolution.mjs [out-dir] [venue ...]`; DPR=2 sets the
// device's pixel ratio (3 by default: most phones). Headless Chromium draws with a software
// rasteriser, so the times stand in for "a GPU where filling pixels is what costs": they are not
// any phone's numbers. For a real device use RECORD PERFORMANCE and compare `?res=full` and `?res=low`.
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
const out = process.argv[2] ?? 'captures/resolution';
const venues = process.argv.slice(3).length ? process.argv.slice(3) : ['kennel-loop', 'knotwood'];
const dpr = Number(process.env.DPR ?? 3);
await mkdir(out, { recursive: true });

const browser = await chromium.launch();
const errors = [];
const rows = [];
for (const v of venues) {
  // `drop` is how many steps below full: auto mode with that many drops already taken
  for (const drop of [0, 1, 2]) {
    const page = await browser.newPage({
      viewport: { width: 844, height: 390 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: dpr,
    });
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${base}?start=${v}&car=mutt&autoplay&seed=7&res=full&bloom=0`);
    await page.waitForTimeout(4000);
    const got = await page.evaluate(async (drop) => {
      const dd = window.__dd;
      const steps = dd.res.steps();
      if (drop >= steps.length) return null;
      dd.res.set(drop);
      const s = dd.session;
      // the same moment of the same race every time, effects held at full
      Object.defineProperty(s.fx, 'quality', { get: () => 1, set() {} });
      while (s.world.time < 14 && s.world.phase !== 'over') s.step();
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      for (let i = 0; i < 4; i++) await frame();
      const t0 = performance.now();
      let n = 0;
      while (performance.now() - t0 < 6000) {
        await frame();
        n++;
      }
      const c = document.getElementById('game');
      return { w: c.width, h: c.height, ms: (performance.now() - t0) / n, per: steps[drop] };
    }, drop);
    if (got) {
      rows.push({ v, drop, ...got });
      await page.screenshot({ path: `${out}/${v}-step${drop}.png` });
    }
    await page.close();
  }
}

console.log(
  `\n844x390 css px, device pixel ratio ${dpr}; software rasteriser (a stand-in, not a phone)\n`,
);
console.log('| venue | step | canvas | pixels | ms a frame | frames a second |');
console.log('| --- | --- | --- | ---: | ---: | ---: |');
for (const r of rows) {
  const full = rows.find((q) => q.v === r.v && q.drop === 0);
  const share = Math.round(((r.w * r.h) / (full.w * full.h)) * 100);
  console.log(
    `| ${r.v} | ${r.drop === 0 ? 'full' : `${r.drop} down`} (${r.per.toFixed(2)} per css px) | ${r.w}x${r.h} | ${share}% | ${r.ms.toFixed(1)} | ${(1000 / r.ms).toFixed(1)} |`,
  );
}
if (errors.length) console.log(`\npage errors:\n  ${errors.join('\n  ')}`);
await browser.close();
server.close();
