// Fight bench: the heaviest seconds of a derby, the same every run, timed tick by tick. A full
// field on autopilot, a blast under a car every third of a second, drums and rockets going off,
// and what each tick cost the page: the world, taking its events into effects, and queueing one
// frame. Also the garbage made, the collections and how long they stopped the page, and the
// texels sent to textures, since a hitch on a phone is most often one of those two.
// `pnpm build && node scripts/perf-fight.mjs [venue ...]`; ROOT=<dist> benches another build,
// SECONDS=20 the length, OUT=file.json saves the numbers, PROFILE=1 saves a CPU profile and an
// allocation profile next to it (captures/fight/). The GPU is given nothing to do (see below), so
// GPU time is not here: these are the page's own milliseconds, on a desktop core (a phone is 2 to 4x).
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const root = process.env.ROOT
  ? `${resolve(process.env.ROOT)}/`
  : new URL('../packages/client/dist/', import.meta.url).pathname;
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
const venues = process.argv.slice(2).length ? process.argv.slice(2) : ['the-pit', 'tank-farm'];
const seconds = Number(process.env.SECONDS ?? 20);
const outDir = 'captures/fight';
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({
  args: [
    `--js-flags=--expose-gc${process.env.OPT ? ' --allow-natives-syntax' : ''}`,
    '--disable-accelerated-2d-canvas',
  ],
});
const errors = [];
const results = [];
for (const venue of venues) {
  const page = await browser.newPage({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  // Once the race is loaded the GPU is given nothing to do: every draw and texture upload is
  // dropped (uploads are counted, in texels). The software rasteriser here would otherwise take
  // seconds a frame on every core, and the page's own time could not be told from its queue.
  await page.addInitScript(() => {
    const G = WebGL2RenderingContext.prototype;
    const bench = (window.__bench = { off: false, texels: 0, uploads: 0 });
    for (const k of [
      'drawArrays',
      'drawArraysInstanced',
      'drawElements',
      'drawElementsInstanced',
      'clear',
      'blitFramebuffer',
      'readPixels',
    ]) {
      const real = G[k];
      G[k] = function (...a) {
        if (!bench.off) return real.apply(this, a);
      };
    }
    for (const k of ['texSubImage2D', 'texImage2D']) {
      const real = G[k];
      G[k] = function (...a) {
        if (!bench.off) return real.apply(this, a);
        const sub = k === 'texSubImage2D';
        const src = a[a.length - 1];
        const sized = a.length >= (sub ? 9 : 9);
        const w = sized ? a[sub ? 4 : 3] : (src?.width ?? 0);
        const h = sized ? a[sub ? 5 : 4] : (src?.height ?? 0);
        if (src) {
          bench.texels += w * h;
          bench.uploads++;
        }
      };
    }
  });
  await page.goto(`${base}?start=${venue}&car=mutt&autoplay&seed=7&res=low&bloom=0`);
  await page.waitForFunction(() => window.__dd?.session, null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  const cdp = await page.context().newCDPSession(page);
  // the page's own frames stop: the bench steps and draws by hand
  await page.evaluate(() => {
    window.requestAnimationFrame = () => 0;
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const s = window.__dd.session;
    Object.defineProperty(s.fx, 'quality', { get: () => 1, set() {} });
    while (s.world.phase === 'countdown') s.step();
    for (let i = 0; i < 120; i++) s.step();
    window.__dd.draw();
    window.__bench.off = true;
    globalThis.gc?.();
  });
  const gcs = [];
  await cdp.send('Tracing.start', {
    traceConfig: { includedCategories: ['v8', 'devtools.timeline', 'disabled-by-default-v8.gc'] },
    transferMode: 'ReportEvents',
  });
  cdp.on('Tracing.dataCollected', (d) => {
    for (const e of d.value)
      if ((e.name === 'MinorGC' || e.name === 'MajorGC') && e.ph === 'X')
        gcs.push({ kind: e.name, ms: e.dur / 1000, args: e.args });
  });
  if (process.env.PROFILE) {
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
    await cdp.send('Profiler.start');
  }
  // everything the page makes is sampled, collected or not: the sum is the garbage of the fight
  {
    await cdp.send('HeapProfiler.startSampling', {
      samplingInterval: 16384,
      includeObjectsCollectedByMajorGC: true,
      includeObjectsCollectedByMinorGC: !process.env.OLD,
    });
  }
  const got = await page.evaluate((ticks) => {
    const dd = window.__dd;
    const s = dd.session;
    const w = s.world;
    const sim = new Float32Array(ticks);
    const fx = new Float32Array(ticks);
    const draw = new Float32Array(ticks);
    let tex0 = window.__bench.texels;
    const texStart = tex0;
    let texMax = 0;
    let peak = { cells: 0, particles: 0, voxels: 0, fires: 0 };
    // its own dice for where the blasts go, so the effects' dice do not move them
    let r = 12345;
    const dice = () => (r = (Math.imul(r, 1664525) + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < ticks; i++) {
      if (i % 20 === 0) {
        const alive = w.cars.filter((c) => !c.wrecked);
        const c = alive[Math.floor(dice() * alive.length)] ?? w.cars[0];
        dd.blast(c.x + (dice() - 0.5) * 40, c.y + (dice() - 0.5) * 40, 0.6 + dice() * 0.8);
      }
      // nobody is left out of the fight for long: a wreck is put back on its wheels
      if (i % 240 === 239) for (const c of w.cars) if (c.wrecked) c.armor = Math.max(c.armor, 1);
      s.ticks = s.simMs = s.stepMs = 0;
      s.step();
      sim[i] = s.simMs;
      fx[i] = s.stepMs;
      const t0 = performance.now();
      dd.draw();
      draw[i] = performance.now() - t0;
      const up = window.__bench.texels - tex0;
      tex0 = window.__bench.texels;
      texMax = Math.max(texMax, up);
      const f = s.fx;
      peak.cells = Math.max(peak.cells, f.cells.live);
      peak.particles = Math.max(peak.particles, f.fx.length);
      peak.voxels = Math.max(peak.voxels, f.voxels.length);
      peak.fires = Math.max(peak.fires, f.fires.length);
    }
    const stat = (a) => {
      const b = Array.from(a).sort((x, y) => x - y);
      const at = (q) => b[Math.min(b.length - 1, Math.floor(q * b.length))];
      return {
        mean: b.reduce((x, y) => x + y, 0) / b.length,
        p50: at(0.5),
        p95: at(0.95),
        p99: at(0.99),
        max: b[b.length - 1],
      };
    };
    const all = sim.map((v, i) => v + fx[i] + draw[i]);
    return {
      sim: stat(sim),
      fx: stat(fx),
      draw: stat(draw),
      all: stat(all),
      over4: all.filter((v) => v > 4).length,
      over8: all.filter((v) => v > 8).length,
      texels: (tex0 - texStart) / ticks,
      texMax,
      peak,
      phase: w.phase,
      wrecked: w.cars.filter((c) => c.wrecked).length,
      cars: w.cars.length,
    };
  }, seconds * 60);
  if (process.env.PROFILE) {
    const { profile } = await cdp.send('Profiler.stop');
    await writeFile(`${outDir}/${venue}.cpuprofile`, JSON.stringify(profile));
  }
  const heap = await cdp.send('HeapProfiler.stopSampling');
  if (process.env.PROFILE)
    await writeFile(`${outDir}/${venue}.heapprofile`, JSON.stringify(heap.profile));
  let madeBytes = 0;
  const walk = (n) => {
    madeBytes += n.selfSize;
    n.children?.forEach(walk);
  };
  walk(heap.profile.head);
  got.kbTick = madeBytes / 1024 / (seconds * 60);
  // OPT=1: which tier the hot functions ended up in (a function left in the interpreter makes
  // garbage out of every number it touches)
  if (process.env.OPT)
    console.log(
      await page.evaluate(() => {
        const st = new Function('f', 'return %GetOptimizationStatus(f)');
        const s = window.__dd.session;
        const fx = s.fx;
        const C = fx.cells;
        const tier = (f) => {
          const b = st(f);
          return b & (1 << 5)
            ? 'turbofan'
            : b & (1 << 15)
              ? 'maglev'
              : b & (1 << 14)
                ? 'baseline'
                : 'interpreted';
        };
        const out = {};
        for (const [k, f] of Object.entries({
          'cells.one': C.one,
          'cells.spray': C.spray,
          'cells.step': C.step,
          'gas.take': C.gpu?.take,
          'fx.flame': fx.flame,
          'fx.afterStep': fx.afterStep,
          'fx.handle': fx.handle,
          'world.step': s.world.step,
        }))
          if (f) out[k] = tier(f);
        return JSON.stringify(out);
      }),
    );
  const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
  await cdp.send('Tracing.end');
  await done;
  if (process.env.GC)
    for (const g of gcs) console.log(g.kind, g.ms.toFixed(2), JSON.stringify(g.args));
  const gc = (k) => gcs.filter((g) => g.kind === k);
  const sum = (a) => a.reduce((x, g) => x + g.ms, 0);
  const max = (a) => a.reduce((x, g) => Math.max(x, g.ms), 0);
  results.push({
    venue,
    ...got,
    minor: { n: gc('MinorGC').length, ms: sum(gc('MinorGC')), max: max(gc('MinorGC')) },
    major: { n: gc('MajorGC').length, ms: sum(gc('MajorGC')), max: max(gc('MajorGC')) },
  });
  await page.close().catch(() => {});
}

const f = (v) => v.toFixed(2);
console.log(`\n${seconds} s of fight, a tick and a frame at a time (ms on this machine's page)\n`);
console.log('| venue | part | mean | p50 | p95 | p99 | worst |');
console.log('| --- | --- | ---: | ---: | ---: | ---: | ---: |');
for (const r of results)
  for (const k of ['sim', 'fx', 'draw', 'all'])
    console.log(
      `| ${r.venue} | ${k} | ${f(r[k].mean)} | ${f(r[k].p50)} | ${f(r[k].p95)} | ${f(r[k].p99)} | ${f(r[k].max)} |`,
    );
console.log(
  '\n| venue | ticks over 4 ms | over 8 ms | KB of garbage a tick | small collections | their ms (worst) | big collections | their ms (worst) | texels uploaded a tick (worst) | peak particles | voxels |',
);
console.log('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
for (const r of results)
  console.log(
    `| ${r.venue} | ${r.over4} | ${r.over8} | ${Math.round(r.kbTick)} | ${r.minor.n} | ${f(r.minor.ms)} (${f(r.minor.max)}) | ${r.major.n} | ${f(r.major.ms)} (${f(r.major.max)}) | ${Math.round(r.texels)} (${r.texMax}) | ${r.peak.particles} | ${r.peak.voxels} |`,
  );
if (process.env.OUT) await writeFile(process.env.OUT, JSON.stringify(results, null, 2));
if (errors.length) console.log(`\npage errors:\n  ${[...new Set(errors)].join('\n  ')}`);
await browser.close();
server.close();
