// The menus and the HUD at a phone's size, for before/after: the main menu, the settings, the
// pause menu, a race with its HUD and touch buttons, the results and the career hub.
// Serves the built client; run with `pnpm ui [out-dir] [--portrait]` (it builds first).
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');

const args = process.argv.slice(2);
const portrait = args.includes('--portrait');
const out = args.find((a) => !a.startsWith('--')) ?? 'captures/ui';
const root = new URL('../packages/client/dist/', import.meta.url).pathname;
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.webmanifest': 'application/manifest+json',
};
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(
    /^(\.\.[/\\])+/,
    '',
  );
  try {
    const file = join(root, path.endsWith('/') ? `${path}index.html` : path);
    const body = await readFile(file);
    res
      .writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' })
      .end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}/`;
await mkdir(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: portrait ? { width: 390, height: 844 } : { width: 844, height: 390 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

const tag = portrait ? '-portrait' : '';
const shot = async (name) => {
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(out, `${name}${tag}.png`) });
  console.log(`  ${name}${tag}.png`);
};
/** Click the first of these that is on the page and shown. */
const tap = async (...sels) => {
  for (const s of sels) {
    const l = page.locator(s).first();
    if ((await l.count()) && (await l.isVisible())) {
      await l.click();
      return true;
    }
  }
  return false;
};
/** Scroll whatever scrolls inside a screen to the bottom. */
const toEnd = (sel) =>
  page.evaluate((s) => {
    const host = document.querySelector(s);
    if (!host) return;
    for (const e of [host, ...host.querySelectorAll('*')])
      if (e.scrollHeight > e.clientHeight + 4) e.scrollTop = e.scrollHeight;
  }, sel);

// the main menu, top and bottom
await page.goto(base);
await page.waitForTimeout(900);
await shot('menu');
await toEnd('#menu');
await shot('menu-end');

// settings from the menu (where there is such a screen), and the dev settings
if (await tap('.settingsBtn')) {
  await shot('menu-settings');
  await tap('#settingsBack');
}
if (await tap('#menu .tuneBtn', '.tuneBtn')) {
  await shot('dev-settings');
  await tap('#tuneBack');
}

// the career hub
await page.goto(`${base}?career`);
await page.waitForTimeout(900);
await shot('career');

// a race: the HUD and the touch buttons
await page.goto(`${base}?start=kennel-loop&car=mutt&autoplay&seed=7`);
await page.waitForTimeout(6500);
await page.evaluate(() => {
  const s = window.__dd.session;
  for (let i = 0; i < 60 * 9; i++) s.step();
});
await shot('race');

// paused: the menu, then every setting it has
await tap('#pauseBtn');
await shot('pause');
await toEnd('#pauseMenu');
await shot('pause-end');
if (await tap('#pauseMenu .settingsBtn')) {
  await shot('pause-settings');
  for (const t of await page.locator('#settings .setTabs button').all()) {
    await t.click();
    await shot(`pause-settings-${(await t.textContent()).trim().toLowerCase()}`);
  }
  await tap('#settingsBack');
}
await tap('#resume');

// a derby, for its HUD
await page.goto(`${base}?start=the-pit&car=bruiser&autoplay&seed=7`);
await page.waitForTimeout(6500);
await page.evaluate(() => {
  const s = window.__dd.session;
  for (let i = 0; i < 60 * 6; i++) s.step();
});
await shot('derby');

// the results
await page.goto(`${base}?start=kennel-loop&car=mutt&autoplay&seed=7`);
await page.waitForTimeout(5000);
await page.evaluate(() => {
  const dd = window.__dd;
  const s = dd.session;
  for (let i = 0; i < 60 * 400 && s.world.phase !== 'over'; i++) s.step();
  dd.finish();
});
await shot('results');

if (errors.length) {
  console.error(`capture-ui: page errors:\n  ${errors.join('\n  ')}`);
  process.exitCode = 1;
}
await browser.close();
server.close();
console.log(`capture-ui: shots in ${out}/`);
