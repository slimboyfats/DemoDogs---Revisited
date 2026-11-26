// What a phone downloads and waits for: serves the built client the way GitHub Pages does (gzip,
// ten minutes of cache), opens it in headless Chromium on a throttled line and processor, and
// prints the bytes on the wire and the times to the menu and to the first race, on a first visit,
// on a second one and with the line cut. Run with `pnpm load` (it builds first).
//   pnpm load [--json] [--venue=kennel-loop]
//   ROOT=<another dist> node scripts/load.mjs      a build from elsewhere, for before and after
//   NEXT=<a newer dist>                            and what a phone fetches when that build goes up
//   NET=4g|slow4g|3g  CPU=<times slower>  RUNS=3   the line, the processor, how many runs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { extname, join, normalize, resolve } from 'node:path';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const root = process.env.ROOT
  ? resolve(process.env.ROOT)
  : new URL('../packages/client/dist/', import.meta.url).pathname;
const venue = flag('venue') ?? 'kennel-loop';
// kilobits a second down and up, and milliseconds there and back
const LINES = {
  '4g': { down: 9000, up: 9000, rtt: 60 },
  slow4g: { down: 1600, up: 750, rtt: 150 },
  '3g': { down: 400, up: 400, rtt: 400 },
};
const lineName = process.env.NET ?? 'slow4g';
const line = LINES[lineName];
if (!line) throw new Error(`NET must be one of ${Object.keys(LINES).join(', ')}`);
const cpu = Number(process.env.CPU ?? 2);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};
// what went down the line since `tally.reset()`, counted where it is sent, so what the worker
// fetches behind the page is in it too
const tally = {
  bytes: 0,
  requests: 0,
  files: [],
  reset() {
    this.bytes = 0;
    this.requests = 0;
    this.files = [];
  },
  mark() {
    return { bytes: this.bytes, requests: this.requests, files: [...this.files] };
  },
};
const HEAD = 250; // about what the headers of an answer weigh
let serving = root;
const packed = new Map();
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(
    /^(\.\.[/\\])+/,
    '',
  );
  const name = path.replace(/^[/\\]/, '') || '/';
  try {
    const file = join(serving, path.endsWith('/') ? `${path}index.html` : path);
    let hit = packed.get(file);
    if (!hit) {
      const raw = await readFile(file);
      const zip = /\.(html|js|css|json|webmanifest|svg)$/.test(file);
      const body = zip ? gzipSync(raw) : raw;
      hit = { body, zip, etag: `"${createHash('sha1').update(raw).digest('hex').slice(0, 16)}"` };
      packed.set(file, hit);
    }
    // GitHub Pages keeps a file fresh for ten minutes. `age` says those are up, so a second
    // visit here is one made later than that, which has to ask whether each file changed.
    const head = { etag: hit.etag, 'cache-control': 'max-age=600', age: '601' };
    tally.requests++;
    if (req.headers['if-none-match'] === hit.etag) {
      tally.bytes += HEAD;
      return void res.writeHead(304, head).end();
    }
    tally.bytes += HEAD + hit.body.length;
    tally.files.push([name, hit.body.length]);
    res
      .writeHead(200, {
        ...head,
        'content-type': types[extname(file)] ?? 'application/octet-stream',
        ...(hit.zip ? { 'content-encoding': 'gzip' } : {}),
        'content-length': hit.body.length,
      })
      .end(hit.body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}/`;

const browser = await chromium.launch();

/** A phone on the throttled line. */
async function phone(context) {
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: line.rtt,
    downloadThroughput: (line.down * 1000) / 8,
    uploadThroughput: (line.up * 1000) / 8,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  // what the page itself is sent (the worker's own fetching is not in this)
  const net = { bytes: 0, requests: 0 };
  cdp.on('Network.loadingFinished', (e) => {
    if (e.encodedDataLength <= 0) return;
    net.bytes += e.encodedDataLength;
    net.requests++;
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  return { page, cdp, net, errors };
}

const newContext = () =>
  browser.newContext({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });

/** Milliseconds from the address being asked for to the menu taking taps, and what was painted when. */
async function toMenu(p) {
  const t0 = Date.now();
  await p.page.goto(base, { waitUntil: 'commit' });
  await p.page.waitForFunction(() => window.__dd && document.body.dataset.screen === 'menu', null, {
    timeout: 120000,
  });
  const ready = Date.now() - t0;
  const paint = await p.page.evaluate(
    () => performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
  );
  return { ready, paint: paint === null ? null : Math.round(paint) };
}

/** Milliseconds from the address being asked for to the race being on the screen. */
async function toRace(p) {
  const t0 = Date.now();
  await p.page.goto(`${base}?start=${venue}&car=mutt&seed=7`, { waitUntil: 'commit' });
  await p.page.waitForFunction(() => document.body.dataset.screen === 'game', null, {
    timeout: 180000,
  });
  return Date.now() - t0;
}

/** Has the page a worker keeping the game, and is it done? */
const keeping = (p) =>
  p.page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false;
    const reg = await navigator.serviceWorker.getRegistration();
    return !!reg?.active;
  });

/** The script the menu on the screen was started by, once it takes taps. */
const running = (p) =>
  p.page.evaluate(() =>
    window.__dd && document.body.dataset.screen === 'menu'
      ? ([...document.scripts]
          .find((x) => x.type === 'module')
          ?.src.split('/')
          .pop() ?? '')
      : null,
  );

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const runs = Number(process.env.RUNS ?? 3);
const out = { root, line: lineName, cpu, venue, runs };
const errors = [];

// a first visit, nothing kept: the menu, then the same phone again later, then with no line
{
  const first = [];
  const second = [];
  for (let i = 0; i < runs; i++) {
    const ctx = await newContext();
    const p = await phone(ctx);
    tally.reset();
    const m = await toMenu(p);
    const menu = { ...p.net };
    // what comes after the menu is up: the worker fetching the game to keep
    await p.page.waitForTimeout(6000);
    first.push({ ...m, menu, all: tally.mark() });
    out.keeps = await keeping(p);

    tally.reset();
    const again = await toMenu(p);
    await p.page.waitForTimeout(1500);
    second.push({ ...again, ...tally.mark() });

    if (i === runs - 1) {
      // a newer build goes up (NEXT): what does the phone fetch to have it?
      if (process.env.NEXT) {
        serving = resolve(process.env.NEXT);
        tally.reset();
        // a phone that kept the old build opens it, hears of the new one and loads that
        const was = await running(p);
        const t0 = Date.now();
        await p.page.goto(base, { waitUntil: 'commit' });
        let now = was;
        for (let n = 0; n < 300 && (now === was || now === null); n++) {
          await p.page.waitForTimeout(100);
          now = await running(p).catch(() => was);
        }
        const ms = Date.now() - t0;
        await p.page.waitForTimeout(6000);
        out.update = { menuMs: ms, ...tally.mark(), runs: now, was };
      }
      await p.cdp.send('Network.emulateNetworkConditions', {
        offline: true,
        latency: 0,
        downloadThroughput: 0,
        uploadThroughput: 0,
      });
      await ctx.setOffline(true);
      try {
        await p.page.goto(base, { waitUntil: 'commit', timeout: 15000 });
        await p.page.waitForFunction(
          () => window.__dd && document.body.dataset.screen === 'menu',
          null,
          { timeout: 15000 },
        );
        out.offline = true;
      } catch {
        out.offline = false;
      }
      serving = root;
    }
    errors.push(...p.errors);
    await ctx.close();
  }
  out.first = {
    paintMs: median(first.map((f) => f.paint)),
    menuMs: median(first.map((f) => f.ready)),
    menuBytes: first[0].menu.bytes,
    menuRequests: first[0].menu.requests,
    allBytes: first[0].all.bytes,
    allRequests: first[0].all.requests,
    files: first[0].all.files,
  };
  out.second = {
    paintMs: median(second.map((f) => f.paint)),
    menuMs: median(second.map((f) => f.ready)),
    bytes: second[0].bytes,
    requests: second[0].requests,
  };
}

// a first visit that goes straight to a race, and the same again later
{
  const first = [];
  const second = [];
  for (let i = 0; i < runs; i++) {
    const ctx = await newContext();
    const p = await phone(ctx);
    first.push(await toRace(p));
    await p.page.waitForTimeout(6000);
    second.push(await toRace(p));
    errors.push(...p.errors);
    await ctx.close();
  }
  out.firstRace = { ms: median(first), all: first };
  out.secondRace = { ms: median(second), all: second };
}

await browser.close();
server.close();

if (args.includes('--json')) {
  console.log(JSON.stringify(out, null, 2));
} else {
  const kb = (n) => `${(n / 1024).toFixed(0)} kB`;
  const s = (n) => (n === null ? 'n/a' : `${(n / 1000).toFixed(2)} s`);
  console.log(`load: ${root}`);
  console.log(
    `line ${lineName} (${line.down} kbit/s, ${line.rtt} ms), processor ${cpu}x slower, middle of ${runs} runs`,
  );
  console.log(
    `first visit   something to see ${s(out.first.paintMs)}, menu ready ${s(out.first.menuMs)}`,
  );
  console.log(
    `              for the menu: ${kb(out.first.menuBytes)} in ${out.first.menuRequests} files`,
  );
  console.log(`              in all: ${kb(out.first.allBytes)} in ${out.first.allRequests} files`);
  for (const [f, n] of out.first.files) console.log(`                ${kb(n).padStart(7)}  ${f}`);
  console.log(`              straight to a race on ${venue}: ${s(out.firstRace.ms)}`);
  console.log(
    `a later visit menu ready ${s(out.second.menuMs)}, ${kb(out.second.bytes)} in ${out.second.requests} requests`,
  );
  console.log(`              straight to a race: ${s(out.secondRace.ms)}`);
  if (out.update)
    console.log(
      `a new build   ${out.update.runs === out.update.was ? 'NOT loaded' : 'on the menu'} after ${s(out.update.menuMs)}; ${kb(out.update.bytes)} fetched: ${out.update.files.map(([f, n]) => `${f} ${kb(n)}`).join(', ')}`,
    );
  console.log(
    `kept on the phone: ${out.keeps ? 'yes' : 'no'}; opens with no line: ${out.offline ? 'yes' : 'no'}`,
  );
  if (errors.length) {
    console.error(`page errors:\n${errors.join('\n')}`);
    process.exitCode = 1;
  }
}
