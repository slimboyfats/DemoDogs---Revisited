// Online smoke test: a local lobby server and two headless phones. One hosts a room, the other
// joins by invite link, they race, and the guest's world must stay in step with the host's (no
// resyncs). Run after `pnpm build`: `node scripts/play-net.mjs` (add `relay` to force the
// WebSocket relay instead of a direct WebRTC link; add `track` to race on a track the host builds
// in the track creator, with an ice stretch and a snowfield). Screenshots go to captures/net-*.png.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const relay = process.argv.includes('relay');
const own = process.argv.includes('track');
// `rough`: a 160 ms round trip with 120 ms of jitter and stalls, then the guest's link is cut, its
// world is knocked out of step, and its page is reloaded: it must get back into the race each time
const rough = process.argv.includes('rough');
const video = process.argv.includes('--video');
const out = process.argv.find((a) => a.startsWith('--out='))?.slice(6) ?? 'captures';
const seconds = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 25);

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

const PORT = 8797;
const signal = spawn('pnpm', ['--filter', '@demodogs/signal', 'start'], {
  env: { ...process.env, PORT: String(PORT) },
  detached: true,
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((r) =>
  signal.stdout.on('data', (d) => String(d).includes('lobby server') && r()),
);
await mkdir(out, { recursive: true });

const fail = (msg) => {
  console.error(`play-net: ${msg}`);
  process.exitCode = 1;
};
const browser = await chromium.launch();
const q = `signal=http://127.0.0.1:${PORT}&ice=none&renderer=canvas${relay ? '&relay=1' : ''}${rough ? '&lag=160&jitter=120&stall=400' : ''}`;
const phone = async (name) => {
  const ctx = await browser.newContext({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
    ...(video
      ? { recordVideo: { dir: `${out}/video-${name}`, size: { width: 800, height: 600 } } }
      : {}),
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fail(`${name}: ${e}`));
  page.on('console', (m) => {
    if (m.type() === 'error') fail(`${name}: ${m.text()}`);
    else if (m.text().startsWith('[net]')) console.log(`${name}: ${m.text()}`);
  });
  return page;
};

async function roughRide(host, guest, read) {
  const banner = (p) => p.locator('#netBanner').textContent();
  const g0 = await read(guest);
  const stalls = await guest.evaluate(() => window.__dd.online.room.race.stalls);
  console.log(`play-net: rough link: guest ${g0.status}, stood still ${stalls} frames in ${g0.t}`);
  if (stalls > g0.t * 0.03)
    fail(`the guest stood still ${stalls} frames of ${g0.t} on a rough link`);
  await guest.screenshot({ path: `${out}/net-rough-guest.png` });

  // 1. the guest's link dies (a phone changing networks)
  await guest.evaluate(() => window.__dd.online.room.link.close());
  await guest.waitForFunction(() =>
    /RECONNECTING/.test(document.querySelector('#netBanner').textContent),
  );
  await guest.screenshot({ path: `${out}/net-reconnecting.png` });
  await host.waitForFunction(() =>
    /LOST CONNECTION/.test(document.querySelector('#netBanner').textContent),
  );
  await host.screenshot({ path: `${out}/net-host-sees-drop.png` });
  await guest.waitForFunction(() => window.__dd.online.room.linked, null, { timeout: 15000 });
  console.log(`play-net: relinked: "${await banner(guest)}", host "${await banner(host)}"`);
  await guest.screenshot({ path: `${out}/net-back.png` });
  await host.waitForTimeout(2500);

  // 2. the guest's world is knocked out of step: the host must notice and put it right
  await guest.evaluate(() => (window.__dd.session.world.cars[0].x += 3));
  await host.waitForFunction(() => window.__dd.online.room.race.desyncs > 0, null, {
    timeout: 15000,
  });
  await guest.waitForFunction(
    () => /OUT OF STEP/.test(document.querySelector('#netBanner').textContent),
    null,
    { timeout: 15000 },
  );
  await guest.screenshot({ path: `${out}/net-out-of-step.png` });
  await guest.waitForFunction(() => window.__dd.online.room.race.lag < 30, null, {
    timeout: 30000,
  });
  await host.waitForTimeout(3000);

  // 3. the guest's page is reloaded mid-race (no room in the address): straight back to its seat
  const url = guest.url().replace(/&room=\w+/, '');
  await guest.goto(url);
  await guest.waitForFunction(
    () => window.__dd?.screen === 'game' && window.__dd.online.room?.race?.lag < 30,
    null,
    { timeout: 60000 },
  );
  await guest.keyboard.down('ArrowUp');
  await host.waitForTimeout(3000);
  console.log('play-net: reloaded guest is back in the race');
  await guest.screenshot({ path: `${out}/net-after-reload.png` });
}

try {
  const host = await phone('host');
  await host.goto(`${base}?${q}`);
  let mine = null;
  if (own) {
    // the host builds a track of their own first: a stretch of ice, a snowfield, a boost tile
    await host.click('#toTracks');
    await host.click('#newTrack');
    await host.waitForFunction(() => document.body.classList.contains('editing'), null, {
      timeout: 90000,
    });
    mine = await host.evaluate(() => {
      const e = window.__dd.editor;
      const t = e.track;
      e.change(() => {
        const p = t.road.points;
        t.name = 'Net Test';
        t.surfaces.push({
          material: 'material.ice',
          x0: p[2][0],
          y0: p[2][1],
          x1: p[3][0],
          y1: p[3][1],
        });
        t.areas.push({ x: p[0][0], y: p[0][1], r: 240, material: 'material.snow', sky: 'snow' });
        t.items.push({ prop: 'prop.boost-pad', x: p[1][0], y: p[1][1], rot: 0 });
      });
      return t.id;
    });
    await host.locator('#builder [data-act="exit"]').click();
    await host.locator('#tracksPanel button', { hasText: 'BACK' }).click();
  }
  await host.click('#toOnline');
  await host.getByText('HOST A RACE').click();
  const code = (await host.locator('.roomCode b').textContent({ timeout: 15000 })).trim();
  console.log(`play-net: room ${code}`);
  const guest = await phone('guest');
  await guest.goto(`${base}?${q}&room=${code}`);
  await host.locator('.seats li').nth(1).waitFor({ timeout: 20000 });
  if (own) {
    await host.selectOption('select[aria-label="Venue"]', `track:${mine}`);
    await guest.getByText('NET TEST').waitFor({ timeout: 10000 });
  }
  await host.screenshot({ path: `${out}/net-lobby.png` });
  await host.locator('#onlinePanel button.go').click();
  for (const p of [host, guest])
    await p.waitForFunction(() => window.__dd.screen === 'game', null, { timeout: 60000 });
  await host.keyboard.down('ArrowUp');
  await guest.keyboard.down('ArrowUp');
  const spot = () =>
    host.evaluate(() => {
      const c = window.__dd.session.world.humans[1];
      return [c.x, c.y];
    });
  const [x0, y0] = await spot();
  await host.waitForTimeout(seconds * 1000);
  const read = (p) =>
    p.evaluate(() => {
      const r = window.__dd.online.room;
      const w = window.__dd.session.world;
      return {
        t: r.race.t,
        desyncs: r.race.desyncs ?? 0,
        lag: r.race.lag ?? 0,
        status: r.status(),
        you: w.player.seat,
        venue: w.venue.id,
        made: [
          (w.roadSurface ?? []).filter(Boolean).length,
          w.venue.weather?.length ?? 0,
          w.pads.length,
          w.laps,
        ].join('/'),
        progress: w.humans.map((c) => Math.round(c.progress)),
      };
    });
  if (rough) await roughRide(host, guest, read);
  const [h, g] = [await read(host), await read(guest)];
  const [x1, y1] = await spot();
  console.log('play-net: host', h);
  console.log('play-net: guest', g);
  await host.screenshot({ path: `${out}/net-host.png` });
  await guest.screenshot({ path: `${out}/net-guest.png` });
  if (g.you !== 1) fail('the guest is not driving seat 1');
  if (own) {
    if (g.venue !== `venue.custom-${mine}` || h.venue !== g.venue)
      fail(`not on the host's track: ${h.venue} and ${g.venue}`);
    if (g.made !== h.made || /^0\/|\/0\//.test(g.made))
      fail(`the guest built the track differently: host ${h.made}, guest ${g.made}`);
  }
  if (h.t < 300) fail(`the host ran only ${h.t} ticks`);
  if (g.t < h.t - 120) fail(`the guest is ${h.t - g.t} ticks behind`);
  if (h.desyncs > (rough ? 1 : 0)) fail(`${h.desyncs} resyncs: the worlds drifted apart`);
  if (Math.hypot(x1 - x0, y1 - y0) < 50) fail("the guest's car didn't move on the host's screen");
  const agreed = await host.evaluate(() => window.__dd.online.room.race.agreed);
  if (agreed < 3) fail(`the host checked only ${agreed} of the guest's hashes`);
  else console.log(`play-net: ${agreed} hashes agreed`);
} finally {
  await browser.close();
  process.kill(-signal.pid);
  server.close();
}
if (!process.exitCode)
  console.log(
    `play-net: ok (${relay ? 'relay' : 'direct'}${own ? ', own track' : ''}${rough ? ', rough link' : ''})`,
  );
