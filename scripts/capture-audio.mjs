// Sound captures: the game makes all its sound as it runs, so this tapes it. Each scene is played
// in headless Chromium at 844x390 with `?tape`, which renders the sound against the game's own
// ticks instead of the clock, so the tape fits the frames however slowly they are drawn. Saves a
// WAV and a spectrogram of each scene, and with `--video` an mp4 of all of them with their sound.
// `pnpm build && node scripts/capture-audio.mjs [out-dir] [--video] [--only=scene]`
// (default captures/audio/).
import { createServer } from 'node:http';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
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
const args = process.argv.slice(2);
const out = args.find((a) => !a.startsWith('--')) ?? 'captures/audio';
const video = args.includes('--video');
const only = args.find((a) => a.startsWith('--only='))?.slice(7);
await mkdir(out, { recursive: true });

/** Blasts and gunfire on the test range, so the heavy sounds are heard on their own. */
const rangeAct = (tick) => {
  const dd = window.__dd;
  const P = dd.session.world.player;
  const at = { 40: [34, -8], 130: [-30, 10], 200: [40, 22], 215: [52, -20], 300: [0, -36] }[tick];
  if (at) dd.dev.use(P.x + at[0], P.y + at[1], 'blast');
};

/** Nothing but the sounds named, a second apart, on a quiet range (`say` makes each one). */
const sayEach = (list, say, gap = 60) =>
  `(tick) => {
    const dd = window.__dd;
    if (tick === 0) dd.sound.engineStop();
    const list = ${JSON.stringify(list)};
    if (tick % ${gap} === 20 && list[(tick - 20) / ${gap}] !== undefined)
      (${say})(dd.sound, list[(tick - 20) / ${gap}]);
  }`;
const KNOCKS = ['car', 'metal', 'wood', 'stone', 'rubber', 'glass', 'soft'];
const JINGLES = ['final-lap', 'win', 'podium', 'finish', 'lost', 'last-standing'];
const SHOP = ['buy', 'denied', 'cash', 'unlock', 'cup', 'cup-lost'];
const CARS = ['terrier', 'pug', 'mutt', 'bruiser', 'whippet', 'wolfhound'];

const scenes = [
  // each car's engine from a standing start, the same road for all of them
  ...CARS.map((c) => ({
    name: `engine-${c}`,
    url: `?start=kennel-loop&car=${c}&autoplay&seed=7`,
    seconds: 7,
  })),
  // what a crash sounds like by what was hit, the tunes for moments, and the shop's
  {
    name: 'knocks',
    url: '?dev&car=mutt',
    seconds: 8,
    act: sayEach(KNOCKS, '(s, k) => s.crash(70, k)'),
    hide: 'devPanel',
  },
  {
    name: 'jingles',
    url: '?dev&car=mutt',
    seconds: 15,
    act: sayEach(JINGLES, '(s, k) => s.jingle(k)', 140),
    hide: 'devPanel',
  },
  {
    name: 'shop',
    url: '?dev&car=mutt',
    seconds: 16,
    act: sayEach(SHOP, '(s, k) => s.jingle(k)', 120),
    hide: 'devPanel',
  },
  { name: 'race-grass', url: '?start=kennel-loop&car=mutt&autoplay&seed=7', seconds: 22 },
  { name: 'race-paved', url: '?start=brickworks&car=mutt&autoplay&seed=3', seconds: 14 },
  { name: 'race-dirt', url: '?start=sunbake-canyon&car=mutt&autoplay&seed=5', seconds: 12 },
  { name: 'race-snow', url: '?start=frostbite-quarry&car=mutt&autoplay&seed=5', seconds: 12 },
  { name: 'derby', url: '?start=the-pit&car=mutt&autoplay&seed=4', seconds: 14 },
  { name: 'blasts', url: '?dev&car=mutt', seconds: 8, act: rangeAct, hide: 'devPanel' },
].filter((s) => !only || s.name === only || s.name.startsWith(`${only}-`));
const cut = Number(args.find((a) => a.startsWith('--seconds='))?.slice(10));
if (cut) for (const s of scenes) s.seconds = cut;

const browser = await chromium.launch();
const errors = [];
const clips = [];
for (const scene of scenes) {
  const page = await browser.newPage({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  page.on('pageerror', (e) => errors.push(`${scene.name}: ${e}`));
  await page.goto(`${base}${scene.url}&tape=${scene.seconds + 2}`);
  await page.waitForFunction(
    () => window.__dd?.session && document.body.dataset.screen === 'game',
    null,
    { timeout: 120000 },
  );
  // stop the game running by the clock: from here it moves only when told to
  const lead = await page.evaluate((hide) => {
    const dd = window.__dd;
    dd.session.rate = 0;
    if (hide) document.getElementById(hide).style.visibility = 'hidden';
    return dd.sound.tapeTime;
  }, scene.hide ?? null);
  const dir = `${out}/${scene.name}-frames`;
  if (video) await mkdir(dir, { recursive: true });
  const act = scene.act ? `(${scene.act})` : null;
  for (let f = 0; f < scene.seconds * 30; f++) {
    await page.evaluate(
      ([code, tick]) => {
        const s = window.__dd.session;
        for (let i = 0; i < 2; i++) {
          if (code) (0, eval)(code)(tick + i);
          s.step();
        }
      },
      [act, f * 2],
    );
    if (video) {
      await page.waitForTimeout(40);
      await page.screenshot({ path: `${dir}/${String(f).padStart(4, '0')}.png` });
    }
  }
  const t1 = Date.now();
  const wav = await page.evaluate(() => window.__dd.sound.tapeWav());
  if (args.includes('--time')) console.log(`${scene.name}: rendered in ${Date.now() - t1} ms`);
  await page.close();
  const raw = `${out}/${scene.name}-raw.wav`;
  const file = `${out}/${scene.name}.wav`;
  await writeFile(raw, Buffer.from(wav, 'base64'));
  const quiet = { stdio: 'ignore' };
  // drop what was taped before the game was stopped, and what is left after the last frame
  execFileSync(
    'ffmpeg',
    ['-y', '-ss', String(lead), '-t', String(scene.seconds), '-i', raw, file],
    quiet,
  );
  await rm(raw);
  execFileSync(
    'ffmpeg',
    ['-y', '-i', file, '-lavfi', 'showspectrumpic=s=1200x400:legend=0', `${out}/${scene.name}.png`],
    quiet,
  );
  const level = spawnSync('ffmpeg', ['-i', file, '-af', 'volumedetect', '-f', 'null', '-'], {
    encoding: 'utf8',
  }).stderr;
  console.log(
    `${scene.name}: mean ${/mean_volume: (\S+)/.exec(level)?.[1]} dB, peak ${/max_volume: (\S+)/.exec(level)?.[1]} dB`,
  );
  if (video) {
    const clip = `${out}/${scene.name}.mp4`;
    execFileSync(
      'ffmpeg',
      [
        ...['-y', '-framerate', '30', '-i', `${dir}/%04d.png`, '-i', file],
        ...['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-c:a', 'aac', '-b:a', '160k'],
        ...['-shortest', clip],
      ],
      quiet,
    );
    await rm(dir, { recursive: true });
    clips.push(clip);
  }
}
if (video && clips.length > 1) {
  const list = `${out}/clips.txt`;
  await writeFile(list, clips.map((c) => `file '${c.split('/').pop()}'`).join('\n'));
  execFileSync(
    'ffmpeg',
    ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', `${out}/audio.mp4`],
    { stdio: 'ignore' },
  );
  await rm(list);
}
if (errors.length) console.log(`page errors:\n  ${errors.join('\n  ')}`);
await browser.close();
server.close();
