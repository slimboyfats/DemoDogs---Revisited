// Traced light captures: the same race frame with the traced light on, off, and the traced field
// itself, by day, at dusk and at night, in headless Chromium at a phone landscape size (844x390,
// dpr 2), plus what the trace costs a frame there (software rendering: a guide, not a phone).
// `pnpm build && node scripts/capture-traced.mjs [out-dir] [venue ...]` (default captures/traced/).
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
const out = process.argv[2] ?? 'captures/traced';
const venues = process.argv.slice(3);
if (!venues.length) venues.push('knotwood', 'brickworks');
await mkdir(out, { recursive: true });

const browser = await chromium.launch();
const errors = [];
const steps = Number(process.env.STEPS ?? 60 * 9);
for (const venue of venues) {
  const page = await browser.newPage({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${base}?start=${venue}&car=mutt&autoplay&seed=7`);
  await page.waitForTimeout(5000);
  await page.evaluate((n) => {
    const s = window.__dd.session;
    for (let i = 0; i < n; i++) s.step();
    // headless frames are slow, and slow frames thin the effects: hold them at full
    Object.defineProperty(s.fx, 'quality', { get: () => 1, set() {} });
    // hold the race still so every shot is the same frame, and clear the screen of controls
    s.advance = () => false;
    for (const e of document.querySelectorAll('#overlay, #controls, #pauseBtn, #pauseKey'))
      e.style.visibility = 'hidden';
  }, steps);
  const baked = async () => {
    for (let i = 0; i < 80; i++) {
      await page.waitForTimeout(250);
      if ((await page.evaluate(() => window.__dd.sky.baking)) === 0) break;
    }
  };
  await baked();
  for (const sky of ['day', 'dusk', 'night']) {
    await page.evaluate((name) => {
      const k = window.__dd.sky;
      k.set(name, true);
      k.state.snap();
    }, sky);
    await baked();
    for (const mode of ['on', 'off', 'field']) {
      await page.evaluate((m) => {
        const sc = window.__dd.sky.scene;
        sc.traced = m !== 'off';
        sc.showTraced = m === 'field';
      }, mode);
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${out}/${venue}-${sky}-${mode}.png` });
      console.log(`${out}/${venue}-${sky}-${mode}.png`);
    }
  }
  // what a frame costs with and without the trace: frames drawn back to back, the GPU made to
  // finish each one
  const cost = await page.evaluate(async () => {
    const sc = window.__dd.sky.scene;
    const time = async (on) => {
      sc.traced = on;
      sc.showTraced = false;
      const ts = [];
      let last = 0;
      await new Promise((done) => {
        const tick = (t) => {
          sc.gl.finish();
          if (last) ts.push(t - last);
          last = t;
          if (ts.length < 12) requestAnimationFrame(tick);
          else done();
        };
        requestAnimationFrame(tick);
      });
      ts.sort((a, b) => a - b);
      return ts[ts.length >> 1];
    };
    const off = await time(false);
    const on = await time(true);
    return { off, on };
  });
  console.log(`${venue}: frame ${cost.off.toFixed(1)} ms without, ${cost.on.toFixed(1)} ms with`);
  await page.close();
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
}
await browser.close();
server.close();
