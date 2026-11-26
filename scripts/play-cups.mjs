// Tournaments by touch: open the career at a phone landscape size in headless Chromium, enter a
// cup, buy upgrades between its rounds, race every round to the end, then run a round of each other
// kind. Checks the flow holds together and shoots each step. Run with `pnpm play:cups [out-dir]`
// (it builds first); pictures go to captures/cups/.
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');

const out = process.argv[2] ?? 'captures/cups';
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
await mkdir(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 844, height: 390 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const fail = (msg) => {
  console.error(`play-cups: ${msg}`);
  process.exitCode = 1;
};
let n = 0;
const shot = async (name) => {
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-${name}.png` });
};
const tab = (name) => page.locator('.tabs button', { hasText: name }).tap();
const item = (name) => page.locator('button.item', { hasText: name }).first().tap();
const career = () => page.evaluate(() => window.__dd.career);
const give = (over) =>
  page.evaluate((o) => window.__dd.setCareer({ ...window.__dd.career, ...o }), over);

/** Start the round on offer, shoot it a few seconds in, run it out and shoot the results. */
async function round(name, ticks = 60 * 9) {
  await tab('TOURNAMENTS');
  await item('START:');
  await page.waitForFunction(() => window.__dd.screen === 'game', null, { timeout: 120000 });
  await page.evaluate((t) => {
    const s = window.__dd.session;
    for (let i = 0; i < t && s.world.phase !== 'over'; i++) s.step();
  }, ticks);
  await page.waitForTimeout(1200);
  if (name) await shot(`${name}-race`);
  const end = await page.evaluate(() => {
    const dd = window.__dd;
    const s = dd.session;
    for (let i = 0; i < 60 * 600 && s.world.phase !== 'over'; i++) s.step();
    dd.finish();
    return {
      phase: s.world.phase,
      screen: dd.screen,
      title: document.getElementById('resTitle').textContent,
    };
  });
  if (end.phase !== 'over' || end.screen !== 'results') fail(`${name}: ${JSON.stringify(end)}`);
  if (name) await shot(`${name}-results`);
  await page.locator('#again').tap();
  return end.title;
}

await page.goto(`${base}?career&autoplay`);
await page.waitForFunction(() => window.__dd?.screen === 'career');
await give({ cash: 2500 });
await tab('TOURNAMENTS');
await shot('tournaments');

// enter the first cup, then spend in the garage before the first round
await item('PUPPY CUP');
let k = await career();
if (k.cup?.id !== 'puppy' || k.cash !== 2350) fail(`entry: ${JSON.stringify(k.cup)} ${k.cash}`);
await shot('entered');
await tab('GARAGE');
await item('ENGINE');
await item('NITRO');
await item('GUNS');
k = await career();
if (k.tune.engine !== 1 || k.gear.nitro !== 1 || k.gear.guns !== 1) fail('upgrades not bought');
await shot('garage');
await tab('RACE');
await shot('ladder-shut');

await round('cup-round-1');
k = await career();
if (k.cup?.round !== 1) fail(`after round 1: ${JSON.stringify(k.cup)}`);
await shot('between-rounds');
await tab('GARAGE');
// the car may have come home without a dent: REPAIR is then not on offer
if (await page.locator('button.item:enabled', { hasText: 'REPAIR' }).count()) await item('REPAIR');
if (await page.locator('button.item:enabled', { hasText: 'TYRES' }).count()) await item('TYRES');
await shot('garage-between-rounds');
await round('');
const last = await round('cup-final');
k = await career();
if (k.cup !== null) fail('the cup did not end');
console.log(`play-cups: puppy cup ended "${last}", trophies ${JSON.stringify(k.trophies)}`);

// a round of each other kind, with the trophies and the cash to get in
await give({ cash: 60000, hp: 100, trophies: { puppy: 1, a: 1, b: 1, c: 1 } });
await tab('TOURNAMENTS');
await shot('tournaments-open');
for (const [name, id, ticks] of [
  ['STOPWATCH TRIALS', 'trial', 60 * 8],
  ['SCRAP LEAGUE', 'derby', 60 * 12],
  ['LAST DOG OUT', 'elimination', 60 * 8],
  ['BOUNTY RUN', 'bounty', 60 * 8],
  ['STORM SERIES', 'storm', 60 * 8],
  ['IRON DOG', 'endurance', 60 * 8],
]) {
  await tab('TOURNAMENTS');
  await item(name);
  await shot(`${id}-entered`);
  await round(id, ticks);
  if (id === 'endurance') {
    await tab('GARAGE');
    await shot('endurance-garage-sealed');
  }
  // walk away from the rest of it
  await tab('TOURNAMENTS');
  if ((await career()).cup) {
    await page.locator('button.small', { hasText: 'WITHDRAW' }).tap();
    await page.locator('button.small', { hasText: 'WITHDRAW' }).tap();
  }
  if ((await career()).cup) fail(`${name}: could not withdraw`);
  await give({ hp: 100 });
}

if (errors.length) fail(`page errors:\n  ${errors.join('\n  ')}`);
await browser.close();
server.close();
if (!process.exitCode) console.log(`play-cups: ok (screenshots in ${out}/)`);
