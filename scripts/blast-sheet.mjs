// Blast sheet: one blast on the test range, as a strip of 1:1 crops at set ticks after it goes
// off (the flash, the ball, the roll, the smoke), to judge an explosion's look frame by frame.
// `pnpm build && node scripts/blast-sheet.mjs [out.png] [power]` (default captures/blast-sheet.png).
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
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
const out = process.argv[2] ?? 'captures/blast-sheet.png';
const power = Number(process.argv[3] ?? 1);
await mkdir(dirname(out), { recursive: true });

const TICKS = [1, 3, 6, 10, 16, 24, 36, 54, 80, 120, 180, 260];
const CW = 380;
const CH = 380;

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
await page.goto(`${base}?dev&car=mutt${process.env.QUERY ?? ''}`);
await page.waitForTimeout(3000);
// the blast goes off beside the car, on open ground; the camera stays on the car
const at = await page.evaluate((power) => {
  const dd = window.__dd;
  const s = dd.session;
  dd.dev.setRate(3);
  for (const id of ['devPanel', 'controls', 'pauseBtn'])
    document.getElementById(id).style.visibility = 'hidden';
  const P = s.world.player;
  // park everything else far away, so nothing else burns or is thrown through the picture
  for (const c of s.world.cars) if (c !== P) c.x += 4000;
  for (const p of s.world.statics) p.x += 4000;
  for (const p of s.world.props) p.x += 4000;
  const bx = P.x - 46;
  const by = P.y + 6;
  // a slow headless frame must not thin the effects: this is the look at full quality
  s.fx.quality = Number(new URLSearchParams(location.search).get('q') ?? 1);
  window.__q = s.fx.quality;
  dd.dev.power = power;
  dd.dev.use(bx, by, 'blast');
  const v = dd.view ? dd.view() : null;
  return { dx: bx - s.cam.x, dy: by - s.cam.y, v };
}, power);
const frames = [];
let done = 0;
for (const t of TICKS) {
  const cam = await page.evaluate((n) => {
    const s = window.__dd.session;
    const P = s.world.player;
    for (let i = 0; i < n; i++) {
      // the car is held where it is: the camera must not wander
      P.vx = P.vy = P.vf = 0;
      s.fx.quality = window.__q;
      s.step();
    }
    return { x: s.cam.x, y: s.cam.y, live: s.fx.cells.live };
  }, t - done);
  done = t;
  if (process.env.LIVE) console.log(t, cam.live);
  await page.waitForTimeout(250);
  frames.push(await page.screenshot());
}
// crops are cut in the page, so the sheet needs no image library here
const sheet = await page.evaluate(
  async ({ shots, CW, CH, dx, dy, TICKS }) => {
    const cols = 6;
    const rows = Math.ceil(shots.length / cols);
    const cv = document.createElement('canvas');
    cv.width = cols * CW;
    cv.height = rows * CH;
    const g = cv.getContext('2d');
    const S = window.__ddScale ?? 4.5;
    for (let i = 0; i < shots.length; i++) {
      const img = new Image();
      img.src = `data:image/png;base64,${shots[i]}`;
      await img.decode();
      const cx = img.width / 2 + dx * S;
      const cy = img.height / 2 + dy * S * Math.sin((56 * Math.PI) / 180);
      const x = (i % cols) * CW;
      const y = Math.floor(i / cols) * CH;
      g.drawImage(img, cx - CW / 2, cy - CH * 0.68, CW, CH, x, y, CW, CH);
      g.fillStyle = '#fff';
      g.font = '18px monospace';
      g.fillText(`tick ${TICKS[i]}`, x + 8, y + 22);
    }
    return cv.toDataURL('image/png').split(',')[1];
  },
  { shots: frames.map((f) => f.toString('base64')), CW, CH, dx: at.dx, dy: at.dy, TICKS },
);
await writeFile(out, Buffer.from(sheet, 'base64'));
console.log(out);
if (errors.length) console.log(`page errors:\n  ${[...new Set(errors)].join('\n  ')}`);
await browser.close();
server.close();
