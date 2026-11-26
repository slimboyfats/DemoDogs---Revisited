// Start-of-race bench: what loading a race and its first seconds cost the page's own thread, on a
// phone-sized screen in headless Chromium. It times every WebGL call that can stall (shader
// builds, texture uploads, read-backs) and every frame's script, and prints, for each venue: the
// time from the address to the first race frame, the load's biggest costs, the slowest frames with
// what they spent their time on, and the JS heap. Run with
// `pnpm build && node scripts/perf-start.mjs [venue ...]` (`pnpm perf:start`); SECONDS=8 sets how
// long it watches, DPR=2 the pixel ratio, QUERY='mods=night' adds to the address,
// STEPS=1 lists what the loader said and when (ms).
//
// Headless Chromium draws with a software rasteriser: frame *rates* here mean nothing. What does
// carry over to a phone is the script time: work done on the first sight of a thing (packing,
// baking, uploading, building a shader) is the same work there, on a slower core.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');

const root = process.env.ROOT ?? new URL('../packages/client/dist/', import.meta.url).pathname;
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
const venues = process.argv.slice(2).length ? process.argv.slice(2) : ['tank-farm', 'knotwood'];
const dpr = Number(process.env.DPR ?? 1);
const frames = Number(process.env.FRAMES ?? 240);
const query = process.env.QUERY ? `&${process.env.QUERY}` : '';
const out = process.env.OUT ?? 'captures/perf-start';
await mkdir(out, { recursive: true });

/** Runs in the page before the game: wraps the calls that can stall and times every frame. */
function probe() {
  const P = (window.__probe = { calls: {}, frames: [], frame: null, t0: performance.now() });
  const wrap = (proto, name, key = name) => {
    const real = proto[name];
    if (!real) return;
    proto[name] = function (...a) {
      const t = performance.now();
      const r = real.apply(this, a);
      const ms = performance.now() - t;
      for (const into of [P.calls, P.frame?.calls]) {
        if (!into) continue;
        const c = (into[key] ??= { n: 0, ms: 0 });
        c.n++;
        c.ms += ms;
      }
      return r;
    };
  };
  const G = WebGL2RenderingContext.prototype;
  for (const n of [
    'compileShader',
    'linkProgram',
    'getProgramParameter',
    'getShaderParameter',
    'getUniformLocation',
    'getAttribLocation',
    'texImage2D',
    'texSubImage2D',
    'texStorage2D',
    'bufferData',
    'bufferSubData',
    'readPixels',
    'getError',
    'checkFramebufferStatus',
    'finish',
    'clientWaitSync',
    'getBufferSubData',
    'drawArraysInstanced',
    'drawElementsInstanced',
    'drawArrays',
    'drawElements',
  ])
    wrap(G, n);
  const C = CanvasRenderingContext2D.prototype;
  wrap(C, 'getImageData', '2d.getImageData');
  wrap(C, 'putImageData', '2d.putImageData');
  wrap(C, 'drawImage', '2d.drawImage');
  // what the loader said, and when
  P.lines = [];
  addEventListener('DOMContentLoaded', () => {
    const line = document.getElementById('loadLine');
    if (!line) return;
    new MutationObserver(() =>
      P.lines.push([Math.round(performance.now() - P.t0), line.textContent]),
    ).observe(line, { childList: true, characterData: true, subtree: true });
  });
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) =>
    raf((t) => {
      const f = (P.frame = { at: performance.now() - P.t0, ms: 0, calls: {} });
      const t1 = performance.now();
      cb(t);
      f.ms = performance.now() - t1;
      P.frame = null;
      f.screen = window.__dd?.screen;
      f.time = window.__dd?.session?.world.time;
      P.frames.push(f);
    });
}

const f1 = (v) => v.toFixed(1);
const top = (calls, n = 6, least = 0.5) =>
  Object.entries(calls)
    .filter(([, c]) => c.ms >= least)
    .sort((a, b) => b[1].ms - a[1].ms)
    .slice(0, n)
    .map(([k, c]) => `${k} ${f1(c.ms)} ms x${c.n}`)
    .join(', ');

const browser = await chromium.launch();
const errors = [];
const report = [];
const say = (s = '') => {
  console.log(s);
  report.push(s);
};
for (const v of venues) {
  const page = await browser.newPage({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: dpr,
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(probe);
  const t0 = Date.now();
  await page.goto(`${base}?start=${v}&car=mutt&autoplay&seed=7${query}`);
  await page.waitForFunction(() => window.__dd?.screen === 'game', null, { timeout: 180000 });
  const loadMs = Date.now() - t0;
  const load = await page.evaluate(() => {
    const P = window.__probe;
    const mem = performance.memory?.usedJSHeapSize ?? 0;
    const got = { calls: P.calls, heap: mem / 1048576, frames: P.frames.length, lines: P.lines };
    P.calls = {};
    P.frames = [];
    return got;
  });
  await page.waitForFunction((n) => window.__probe.frames.length >= n, frames, {
    timeout: 600000,
  });
  const race = await page.evaluate(() => {
    const P = window.__probe;
    const dd = window.__dd;
    return {
      calls: P.calls,
      frames: P.frames,
      heap: (performance.memory?.usedJSHeapSize ?? 0) / 1048576,
      atlas: dd.atlas,
      time: dd.session.world.time,
    };
  });
  await page.close();
  const fr = race.frames.filter((f) => f.screen === 'game');
  const ms = fr.map((f) => f.ms).sort((a, b) => a - b);
  const pct = (p) => ms[Math.min(ms.length - 1, Math.floor(ms.length * p))] ?? 0;
  const sum = ms.reduce((a, b) => a + b, 0);
  say(`== ${v} (844x390 dpr ${dpr})`);
  say(`load: ${(loadMs / 1000).toFixed(2)} s to the first race frame, heap ${f1(load.heap)} MB`);
  say(`  load's calls: ${top(load.calls, 8)}`);
  if (process.env.STEPS)
    say(`  loader: ${load.lines.map(([t, text]) => `${t} ${text}`).join(' | ')}`);
  say(
    `first ${fr.length} frames (${f1(race.time)} s of the race): script per frame median ${f1(pct(0.5))} ms, ` +
      `p95 ${f1(pct(0.95))} ms, worst ${f1(ms[ms.length - 1] ?? 0)} ms, total ${f1(sum)} ms; ` +
      `heap ${f1(race.heap)} MB; atlas ${Math.round((race.atlas?.fill ?? 0) * 100)}%`,
  );
  say(`  calls: ${top(race.calls, 10)}`);
  const worst = fr
    .map((f, i) => ({ f, i }))
    .sort((a, b) => b.f.ms - a.f.ms)
    .slice(0, 8)
    .sort((a, b) => a.i - b.i);
  for (const { f, i } of worst)
    say(
      `  frame ${i} (race time ${f1(f.time ?? 0)} s): ${f1(f.ms)} ms  ${top(f.calls, 5, 0.3) || '(no stalling calls: plain script)'}`,
    );
  say();
}
await browser.close();
server.close();
await writeFile(`${out}/report.txt`, report.join('\n'));
if (errors.length) {
  console.error('page errors:\n' + errors.join('\n'));
  process.exit(1);
}
