// Tricks captures: stage each of the ten tricks out of the Bag of Tricks on the test range in
// headless Chromium (844x390, dpr 2) and save stills, and frames for a video when asked.
// `pnpm tricks [out-dir] [--frames] [--only=scene]` (default captures/tricks/).
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
const args = process.argv.slice(2);
const frames = args.includes('--frames');
const only = args.find((a) => a.startsWith('--only='))?.slice(7);
const out = args.find((a) => !a.startsWith('--')) ?? 'captures/tricks';
await mkdir(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 844, height: 390 },
  isMobile: true,
  hasTouch: true,
  // (frames for a video are taken at 1: a frame at 2 costs several seconds in software GL)
  deviceScaleFactor: frames ? 1 : 2,
});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

/** Open the test range with time stopped and the panel hidden. */
const range = async (query = '') => {
  await page.goto(`${base}?dev&car=mutt${query}`);
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    const dd = window.__dd;
    dd.dev.setRate(3);
    document.getElementById('devPanel').style.visibility = 'hidden';
    const w = dd.session.world;
    for (const c of w.cars) c.ai = null;
    for (const p of w.props) p.alive = false;
    w.pickups.length = 0;
    dd.home = { x: w.player.x, y: w.player.y };
    // helpers for the scenes below: places are measured from where the player started
    dd.put = (i, dx, dy, h = 0, v = 0) => {
      const c = w.cars[i];
      Object.assign(c, { x: dd.home.x + dx, y: dd.home.y + dy, h, z: 0, vz: 0, spin: 0 });
      c.vx = Math.cos(h) * v;
      c.vy = Math.sin(h) * v;
      c.vf = v;
    };
    /** Everybody whole, bare of tricks and parked far off; the player back at home. */
    dd.clear = () => {
      w.cars.forEach((c, i) => {
        c.hp = 100;
        c.wrecked = false;
        c.has = { front: true, rear: true, top: true };
        c.tricks = {};
        c.weapon = null;
        c.ammo = 0;
        c.rounds = 0;
        c.invuln = 0;
        c.shield = 0;
        c.blind = 0;
        dd.put(i, i ? 700 + i * 40 : 0, i ? 500 : 0);
      });
      w.craters.length = 0;
    };
    dd.give = (i, id) => {
      dd.dev.pickupSel.value = `pickup.${id}`;
      dd.dev.use(w.cars[i].x, w.cars[i].y, 'give');
    };
    // a caption along the bottom of the picture: which trick this is, and what it does
    const cap = document.createElement('div');
    cap.style.cssText =
      'position:fixed;left:0;right:0;bottom:10px;text-align:center;font:900 17px system-ui,sans-serif;' +
      'color:#fff;text-shadow:0 2px 0 #000,0 0 6px #000;z-index:99;pointer-events:none;letter-spacing:.5px';
    document.body.append(cap);
    dd.caption = (t) => (cap.textContent = t);
  });
};
const step = (n, ctl) =>
  page.evaluate(
    ([n, ctl]) => {
      const dd = window.__dd;
      const s = dd.session;
      if (ctl) s.o.input.read = () => ctl;
      for (let i = 0; i < n; i++) {
        dd.each?.();
        s.step();
      }
    },
    [n, ctl],
  );
const shot = async (name) => {
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${out}/${name}.png` });
};
let reel = 0;
/** Run n ticks; with --frames, save a frame every third tick for the video (20 a second). */
const roll = async (n, ctl) => {
  if (!frames) return step(n, ctl);
  for (let i = 0; i < n; i += 3) {
    await step(3, ctl);
    await page.waitForTimeout(40);
    await page.screenshot({ path: `${out}/f${String(reel++).padStart(4, '0')}.jpg`, quality: 92 });
  }
};
const GO = { steer: 0, throttle: 1, brake: false, boost: false, fire: false };
const IDLE = { steer: 0, throttle: 0, brake: false, boost: false, fire: false };

/** Each scene: its caption, how it is staged (in the page), and how it is played out. */
const scenes = {
  'party-balloons': {
    caption: 'PARTY BALLOONS: every rival in reach floats off, then drops',
    stage: () => {
      const dd = window.__dd;
      dd.put(1, 55, -22, 0.3);
      dd.put(2, 95, 18, -0.4);
      dd.put(3, 40, 40, 2);
    },
    play: async () => {
      await roll(20, IDLE);
      await page.evaluate(() => window.__dd.give(0, 'party-balloons'));
      await roll(70, IDLE);
      await shot('party-balloons');
      await roll(110, IDLE);
      await shot('party-balloons-pop');
      await roll(50, IDLE);
    },
  },
  'dog-door': {
    caption: 'DOG DOOR: in one door, out of another right behind a rival',
    stage: () => {
      const dd = window.__dd;
      dd.put(0, -60, 10, 0, 90);
      dd.put(1, 110, -30, 0.5);
    },
    play: async () => {
      await roll(24, GO);
      await page.evaluate(() => window.__dd.give(0, 'dog-door'));
      await roll(8, GO);
      await shot('dog-door');
      await roll(90, GO);
    },
  },
  greyhound: {
    caption: 'GREYHOUND: a comet that steers itself and throws rivals aside',
    stage: () => {
      const dd = window.__dd;
      dd.put(0, -110, 0, 0, 40);
      dd.put(1, 30, 4, 1.2);
      dd.put(2, 120, -30, -0.6);
    },
    play: async () => {
      await roll(16, IDLE);
      await page.evaluate(() => window.__dd.give(0, 'greyhound'));
      await roll(30, IDLE);
      await shot('greyhound');
      await roll(40, IDLE);
      await shot('greyhound-wham');
      await roll(140, IDLE);
    },
  },
  'mud-pie': {
    caption: 'MUD PIE: mud in the face of every rival in reach',
    stage: () => {
      const dd = window.__dd;
      dd.put(1, 55, -22, 0.3);
      dd.put(2, 95, 18, -0.4);
    },
    play: async () => {
      await roll(16, IDLE);
      await page.evaluate(() => window.__dd.give(0, 'mud-pie'));
      await roll(40, IDLE);
      await shot('mud-pie');
      await roll(60, IDLE);
      await page.evaluate(() => {
        const dd = window.__dd;
        dd.caption('MUD PIE: and what it looks like when a rival throws one at you');
        dd.session.world.cars[1].tricks = {};
        dd.give(1, 'mud-pie');
      });
      await roll(50, { ...GO, steer: 0.2 });
      await shot('mud-pie-on-you');
      await roll(240, { ...GO, steer: 0.2 });
    },
  },
  'sticky-paws': {
    caption: "STICKY PAWS: lifts the nearest rival's weapon, rounds and all",
    stage: () => {
      const dd = window.__dd;
      const w = dd.session.world;
      dd.put(1, 85, -18, 2.6);
      const rocket = w.content.weapon.get('weapon.rocket');
      w.cars[1].weapon = rocket;
      w.cars[1].ammo = rocket.ammo;
    },
    play: async () => {
      await roll(16, IDLE);
      await page.evaluate(() => window.__dd.give(0, 'sticky-paws'));
      await roll(10, IDLE);
      await shot('sticky-paws');
      await roll(80, IDLE);
    },
  },
  'chasing-tails': {
    caption: 'CHASING TAILS: rivals in reach steer back to front (here: you, steering left)',
    stage: () => {
      const dd = window.__dd;
      dd.put(0, -40, 0, 0, 80);
      dd.put(1, 40, 50, -1);
      dd.put(2, 90, -30, 2);
    },
    play: async () => {
      await roll(20, { ...GO, steer: -0.5 });
      await page.evaluate(() => window.__dd.give(1, 'chasing-tails'));
      await roll(50, { ...GO, steer: -0.5 });
      await shot('chasing-tails');
      await roll(120, { ...GO, steer: -0.5 });
    },
  },
  'best-friends': {
    caption: 'BEST FRIENDS: two rivals are hauled together like magnets',
    stage: () => {
      const dd = window.__dd;
      dd.put(1, 70, -70, 0.4);
      dd.put(2, 80, 70, -0.6);
    },
    play: async () => {
      await roll(16, IDLE);
      await page.evaluate(() => window.__dd.give(0, 'best-friends'));
      await roll(26, IDLE);
      await shot('best-friends');
      await roll(150, IDLE);
    },
  },
  'bouncy-ball': {
    caption: 'BOUNCY BALL: whatever touches the car is flung off it',
    stage: () => {
      const dd = window.__dd;
      dd.put(1, 150, 0, Math.PI, 0);
      dd.put(2, -20, 130, -Math.PI / 2, 0);
    },
    play: async () => {
      await page.evaluate(() => window.__dd.give(0, 'bouncy-ball'));
      await roll(40, IDLE);
      await shot('bouncy-ball');
      // the range's parked cars have no driver: send each at the player by hand
      for (const [i, vx, vy] of [
        [1, -150, 0],
        [2, 0, -150],
      ]) {
        await page.evaluate(
          ([i, vx, vy]) => {
            const dd = window.__dd;
            const c = dd.session.world.cars[i];
            let n = 0;
            dd.each = () => {
              if (n++ > 60 || c.hitCd > 0) return (dd.each = null);
              c.vx = vx;
              c.vy = vy;
              c.spin = 0;
            };
          },
          [i, vx, vy],
        );
        await roll(70, IDLE);
        if (i === 1) await shot('bouncy-ball-boing');
      }
      await roll(30, IDLE);
    },
  },
  'belly-flop': {
    caption: 'BELLY FLOP: a leap onto the nearest rival, landing as a blast',
    stage: () => {
      const dd = window.__dd;
      dd.put(0, -60, 0, 0, 0);
      dd.put(1, 60, -10, 1.4);
      dd.put(2, 90, 26, -2);
    },
    play: async () => {
      await roll(16, IDLE);
      await page.evaluate(() => window.__dd.give(0, 'belly-flop'));
      await roll(36, IDLE);
      await shot('belly-flop');
      await roll(40, IDLE);
      await shot('belly-flop-landed');
      await roll(110, IDLE);
    },
  },
  'ghost-dog': {
    caption: 'GHOST DOG: rivals drive straight through, and nothing can hurt it',
    stage: () => {
      const dd = window.__dd;
      dd.put(1, 150, 0, Math.PI, 0);
    },
    play: async () => {
      await page.evaluate(() => window.__dd.give(0, 'ghost-dog'));
      await roll(40, IDLE);
      await shot('ghost-dog');
      await page.evaluate(() => {
        const dd = window.__dd;
        const c = dd.session.world.cars[1];
        let n = 0;
        dd.each = () => {
          if (n++ > 110) return (dd.each = null);
          c.vx = -130;
          c.vy = 0;
          c.h = Math.PI;
          c.spin = 0;
        };
      });
      await roll(56, IDLE);
      await shot('ghost-dog-through');
      await roll(70, IDLE);
    },
  },
};

await range();
await step(60, IDLE);
for (const [name, scene] of Object.entries(scenes)) {
  if (only && only !== name) continue;
  await page.evaluate(
    ([caption]) => {
      const dd = window.__dd;
      dd.each = null;
      dd.clear();
      dd.caption(caption);
    },
    [scene.caption],
  );
  await page.evaluate(scene.stage);
  await step(30, IDLE);
  await scene.play();
  console.log(`${name}: done`);
}

if (errors.length) console.log(`page errors:\n  ${errors.join('\n  ')}`);
await browser.close();
server.close();
if (frames)
  console.log(
    `frames in ${out}: ffmpeg -framerate 20 -i ${out}/f%04d.jpg -pix_fmt yuv420p ${out}/tricks.mp4`,
  );
