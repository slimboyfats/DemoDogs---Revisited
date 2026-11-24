import type { SimEvent } from '@demodogs/shared';
import { fleaAt, isArsenal, type World } from '@demodogs/sim';
import type { Art } from './art';
import type { Effects } from './effects';
import { HAZE, SOOT } from './pixel/particles';
import type { StackSink } from './stacks';
import type { Sound } from '../audio/sound';
import { queueWild, wildLights, wildTick } from './wild-fx';

/**
 * How the ten odd arms look and sound: the stick's whirr, the hook's line, the marks where shells
 * will land, the digger's furrow, fleas as single hopping cells, the ray as a line of hot cells
 * and the smoke where it rests, the swap's two columns of sparks. Everything here is read from
 * sim events and world state; nothing is a drawn shape bigger than a cell.
 */

const TAU = Math.PI * 2;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(l: readonly T[]): T => l[(Math.random() * l.length) | 0]!;

const ROPE = [0xf0e4c0, 0xd8c898, 0xf0e4c0, 0x6a5a3a] as const;
const RAY = [0xff2a2a, 0xff5040, 0xffb0a0, 0xffffff] as const;
const SWAP = [0x40e8ff, 0xa6fbff, 0xff60e0, 0xffffff] as const;
const EARTH = [0x5a3a20, 0x6b4724, 0x3a2a20, 0x8d5631] as const;
const FLEA = [0x140c0a, 0xd0562a, 0x2a1410] as const;
const MARK = [0xff2a2a, 0xff9a3a] as const;

type Mine = Extract<
  SimEvent,
  {
    t:
      | 'fire'
      | 'catch'
      | 'leash'
      | 'snap'
      | 'incoming'
      | 'sentry'
      | 'flea'
      | 'beam'
      | 'swap'
      | 'fizz';
  }
>;

/**
 * One solid cell (`size` art px) that lasts until the next tick draws it again: for lines and
 * things that move. Drawn opaque, so dark things show too.
 */
function dot(fx: Effects, x: number, y: number, z: number, rgb: number, size = 0.8): void {
  fx.emit('pip', x, y, z, 0, 0, 0, 0.03, size, rgb);
}

/** A line of single cells from a to b, `sag` art px of slack hanging in the middle of it. */
function line(
  fx: Effects,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  z: number,
  tones: readonly number[],
  sag = 0,
): void {
  const len = Math.hypot(bx - ax, by - ay);
  const n = Math.max(1, Math.ceil(len / 0.7));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    dot(
      fx,
      ax + (bx - ax) * t,
      ay + (by - ay) * t,
      Math.max(0.5, z - sag * 4 * t * (1 - t)),
      tones[i % tones.length]!,
    );
  }
}

/** A sim event for these arms: show it. Returns true if it was one of theirs. */
export function arsenalEvent(fx: Effects, w: World, e: Mine, S: Sound): boolean {
  const P = w.player;
  switch (e.t) {
    case 'fire': {
      const d = w.content.weapon.get(e.weapon);
      if (!d || !isArsenal(d.kind)) return false;
      const c = w.cars[e.car]!;
      const v = fx.vol(c.x, c.y);
      if (v <= 0) return true;
      if (d.kind === 'boomerang' || d.kind === 'swarm' || d.kind === 'twister') S.whoosh(v);
      else if (d.kind === 'fissure') S.boom(v * 0.6);
      else if (d.kind === 'pit') S.thud(v);
      else if (d.kind === 'flail') S.clang(v);
      else if (d.kind === 'meteor') S.howl(v * 0.6);
      else if (d.kind === 'frost') S.drop();
      else if (d.kind === 'skip' || d.kind === 'sentry') S.drop();
      else if (d.kind === 'burrow') S.thud(v);
      else if (d.kind === 'swap') S.zap(v);
      else if (d.kind === 'trail') S.hiss(v, true);
      else if (d.kind !== 'beam') S.fire();
      if (d.kind === 'burrow') for (let i = 0; i < 8; i++) fx.puff(c.x, c.y, 0.5, 'dust');
      return true;
    }
    case 'catch': {
      for (let i = 0; i < 6; i++) fx.spark(e.x, e.y, 5, 40);
      if (e.car === P.index) fx.text(P.x, P.y, 'CAUGHT!', '#a6fbff');
      if (fx.vol(e.x, e.y) > 0) S.pickup();
      return true;
    }
    case 'leash': {
      for (let i = 0; i < 12; i++) fx.spark(e.x, e.y, 5, 70);
      if (e.from === P.index) fx.text(e.x, e.y, 'HOOKED!', '#ffd24a', true);
      else if (e.to === P.index) fx.text(P.x, P.y, 'ON A LEASH!', '#ff6a3d', true);
      const v = fx.vol(e.x, e.y);
      if (v > 0) S.clang(v);
      return true;
    }
    case 'snap': {
      // the line parts: its strands fly off as loose cells
      for (let i = 0; i < 14; i++)
        fx.emit(
          'spark',
          e.x + rand(-8, 8),
          e.y + rand(-8, 8),
          4,
          rand(-60, 60),
          rand(-60, 60),
          rand(10, 60),
          rand(0.2, 0.5),
          1,
          pick(ROPE),
        );
      const v = fx.vol(e.x, e.y);
      if (v > 0) S.pop(v);
      return true;
    }
    case 'incoming': {
      const v = fx.vol(e.x, e.y);
      if (v > 0.2) S.whoosh(v * 0.5);
      return true;
    }
    case 'sentry': {
      if (e.what === 'up') {
        for (let i = 0; i < 4; i++) fx.puff(e.x, e.y, 0.5, 'dust');
        const v = fx.vol(e.x, e.y);
        if (v > 0) S.clang(v);
      } else if (e.what === 'spent') {
        // it folds up in a twist of smoke and a few sparks
        fx.plume(e.x, e.y, 3, 3, HAZE);
        for (let i = 0; i < 5; i++) fx.spark(e.x, e.y, 4, 30);
      } else for (let i = 0; i < 12; i++) fx.spark(e.x, e.y, 3, 90);
      return true;
    }
    case 'flea': {
      if (e.car === P.index && w.arsenal.fleas.filter((f) => f.host === P.index).length <= 1)
        fx.text(P.x, P.y, 'FLEAS! JUMP TO SHAKE THEM', '#ff6a3d', true);
      return true;
    }
    case 'beam': {
      if (!e.on) return true;
      const c = w.cars[e.car]!;
      const v = fx.vol(c.x, c.y);
      if (v > 0) S.zap(v, true);
      return true;
    }
    case 'swap': {
      // each car goes up in a column of sparks where it was, and the air there bends
      for (const [x, y] of [
        [e.ax, e.ay],
        [e.bx, e.by],
      ] as const) {
        fx.flashes.push({ x, y, r: 44, life: 0.25, max: 0.25, rgb: 0x80f0ff });
        fx.ripples.push({ x, y, z: 0, t: 0, dur: 0.45, maxR: 46, width: 9, strength: 1 });
        for (let i = 0; i < 40 * fx.quality; i++) {
          const a = rand(0, TAU);
          const r = rand(0, 9);
          fx.emit(
            'spark',
            x + Math.cos(a) * r,
            y + Math.sin(a) * r,
            rand(0, 6),
            -Math.sin(a) * 40,
            Math.cos(a) * 40,
            rand(60, 220),
            rand(0.25, 0.7),
            1,
            pick(SWAP),
          );
        }
      }
      line(fx, e.ax, e.ay, e.bx, e.by, 6, SWAP);
      if (e.a === P.index) fx.text(P.x, P.y, 'SWITCHEROO!', '#a6fbff', true);
      else if (e.b === P.index) fx.text(P.x, P.y, 'SWITCHED!', '#ff6a3d', true);
      if (e.a === P.index || e.b === P.index) fx.shake = Math.max(fx.shake, 6);
      const v = Math.max(fx.vol(e.ax, e.ay), fx.vol(e.bx, e.by));
      if (v > 0) S.zap(v, true);
      return true;
    }
    case 'fizz': {
      for (let i = 0; i < 4; i++) fx.spark(e.x, e.y, 4, 30);
      fx.puff(e.x, e.y, 1, 'dust');
      return true;
    }
  }
}

/** Each tick: what is in flight, on a line, under the ground or burning. */
export function arsenalTick(fx: Effects, w: World, S: Sound): void {
  wildTick(fx, w, S);
  const K = w.arsenal;
  const q = fx.quality;
  const now = w.time;

  for (const s of K.sticks) {
    // the whirr: a wisp of air torn off each tip as it turns
    const a = now * 26;
    for (const k of [0, Math.PI])
      fx.emit(
        'spark',
        s.x + Math.cos(a + k) * 4,
        s.y + Math.sin(a + k) * 4,
        s.z + 5,
        0,
        0,
        20,
        0.12,
        1,
        0xe8dcc0,
      );
  }

  for (const t of K.toys) {
    // the fuse fizzes all the way
    fx.emit(
      'spark',
      t.x,
      t.y,
      t.level + t.z + 7,
      rand(-20, 20),
      rand(-20, 20),
      rand(10, 40),
      0.22,
      1,
      0xffd070,
    );
    if (Math.random() < 0.4 * q) fx.plume(t.x, t.y, t.level + t.z + 5, 1.5, HAZE, 4);
  }

  for (const h of K.hooks) {
    const c = w.cars[h.owner]!;
    line(fx, c.x, c.y, h.x, h.y, h.z + 4, ROPE);
  }
  for (const t of K.tethers) {
    const a = w.cars[t.a]!;
    const b = w.cars[t.b]!;
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const slack = t.def.reach ?? 34;
    // slack, it hangs; tight, it is a straight line that throws off the odd spark
    line(fx, a.x, a.y, b.x, b.y, Math.min(a.z, b.z) + 4, ROPE, d < slack ? 1 - d / slack : 0);
    if (d > slack * 1.5 && Math.random() < 0.3) fx.spark((a.x + b.x) / 2, (a.y + b.y) / 2, 4, 30);
  }

  for (const s of K.strikes) {
    // the mark: a ring of red cells closing on the spot, faster as the shell comes
    const k = Math.max(0, s.t / s.from);
    const r = 4 + 9 * k;
    const n = Math.ceil(14 * q);
    const turn = now * (3 + 6 * (1 - k));
    for (let i = 0; i < n; i++) {
      const a = turn + (i / n) * TAU;
      dot(fx, s.x + Math.cos(a) * r, s.y + Math.sin(a) * r, 0.6, MARK[i & 1]!);
    }
    dot(fx, s.x, s.y, 0.6, 0xffffff, 1.2);
    // and the shell itself, trailing smoke down the sky
    const z = shellHeight(s.t);
    if (z < 240 && Math.random() < 0.7) fx.plume(s.x, s.y, z + 8, 2, HAZE, 6);
  }

  for (const m of K.moles) {
    const cs = Math.cos(m.h);
    const sn = Math.sin(m.h);
    // earth thrown up either side of the hump and a furrow left behind it
    for (let i = 0; i < 3 * q + 0.5; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      fx.emit(
        'spark',
        m.x - cs * 3 + rand(-2, 2),
        m.y - sn * 3 + rand(-2, 2),
        1,
        -sn * side * rand(15, 50) - cs * rand(0, 30),
        cs * side * rand(15, 50) - sn * rand(0, 30),
        rand(30, 80),
        rand(0.3, 0.6),
        1,
        pick(EARTH),
      );
    }
    if (Math.random() < 0.5 * q) fx.puff(m.x - cs * 5, m.y - sn * 5, 0.5, 'dust');
    if (w.tick % 2 === 0)
      fx.paintGround(m.x, m.y, 4, (g) => {
        for (let i = 0; i < 9; i++) {
          g.fillStyle = Math.random() < 0.5 ? 'rgba(40,26,16,0.75)' : 'rgba(96,66,38,0.6)';
          g.fillRect(
            Math.floor(m.x - cs * 4 + rand(-2.5, 2.5)),
            Math.floor(m.y - sn * 4 + rand(-2.5, 2.5)),
            1,
            1,
          );
        }
      });
  }

  K.fleas.forEach((f, i) => {
    // two cells each, a dark body with a rust back: on the ground they hop, on a car they jump
    // about its roof and it scratches up a little dust
    const [x, y] = fleaAt(w, f);
    const tone = FLEA[i % 3]!;
    if (f.host >= 0) {
      const c = w.cars[f.host]!;
      const fx0 = x + Math.sin(now * 9 + i * 2.1) * 2;
      const fy0 = y + Math.cos(now * 7 + i * 1.3) * 2;
      const z = c.z + c.def.top.z + 1.5 + Math.abs(Math.sin(now * 12 + i * 1.9)) * 5;
      dot(fx, fx0, fy0, z, tone, 1.2);
      dot(fx, fx0, fy0, z + 1, 0xd0562a, 0.8);
      if (Math.random() < 0.03 * q) fx.puff(x, y, c.z + c.def.top.z, 'dust');
    } else {
      const hop = Math.abs(Math.sin(now * 13 + i * 1.7));
      dot(fx, x, y, 0.5 + hop * 7, tone, 1.2);
      dot(fx, x, y, 1.5 + hop * 7, 0xd0562a, 0.8);
      if (hop < 0.12 && Math.random() < 0.3 * q) fx.puff(x, y, 0.3, 'dust');
    }
  });

  for (const b of K.beams) {
    const c = w.cars[b.car]!;
    const z = c.z + 4.5;
    const dx = b.tx - b.x;
    const dy = b.ty - b.y;
    const len = Math.hypot(dx, dy) || 1;
    // the ray: a line of hot cells, redder at the edges of its flicker
    for (let s = 0; s <= len; s += 0.5) {
      const px = b.x + (dx / len) * s;
      const py = b.y + (dy / len) * s;
      dot(fx, px, py, z, Math.random() < 0.25 ? 0xffd0c0 : 0xff2a2a, 0.7);
      if (Math.random() < 0.35) {
        const j = rand(-0.8, 0.8);
        fx.emit('spark', px - (dy / len) * j, py + (dx / len) * j, z, 0, 0, 12, 0.07, 1, pick(RAY));
      }
    }
    fx.flashes.push({ x: b.tx, y: b.ty, r: 13, life: 0.05, max: 0.05, rgb: 0xff4030 });
    // where it rests: sparks, a lick of flame, smoke, and a burn on the ground
    for (let i = 0; i < 2; i++) fx.spark(b.tx, b.ty, z, 60);
    if (Math.random() < 0.5 * q) fx.flame(b.tx, b.ty, z - 2, 2);
    if (Math.random() < 0.3 * q) fx.plume(b.tx, b.ty, z, 2, SOOT, 16);
    if (b.on < 0 && Math.random() < 0.2) fx.scorch(b.tx, b.ty, 1.5);
    if (w.tick % 8 === 0) {
      const v = fx.vol(c.x, c.y);
      if (v > 0) S.crackle(v * 0.6);
    }
  }

  for (const b of K.bolts) {
    // a knot of bright cells winding round the line it flies
    for (let i = 0; i < 5; i++) {
      const a = now * 40 + i * 1.3;
      const back = i * 2.2;
      fx.emit(
        'spark',
        b.x - Math.cos(b.h) * back - Math.sin(b.h) * Math.cos(a) * 2.2,
        b.y - Math.sin(b.h) * back + Math.cos(b.h) * Math.cos(a) * 2.2,
        b.z + 5 + Math.sin(a) * 2.2,
        rand(-8, 8),
        rand(-8, 8),
        rand(-4, 10),
        rand(0.08, 0.3),
        1,
        pick(SWAP),
      );
    }
  }

  for (const t of K.trails) {
    const c = w.cars[t.car]!;
    if (c.z - c.deck > 4) continue;
    // both back wheels are alight
    const cs = Math.cos(c.h);
    const sn = Math.sin(c.h);
    const hl = c.def.body.halfLength * c.size;
    const hw = c.def.body.halfWidth * c.size;
    for (const side of [-1, 1])
      fx.flame(
        c.x - cs * hl * 0.8 - sn * side * hw,
        c.y - sn * hl * 0.8 + cs * side * hw,
        c.z + 0.5,
        2.5,
        -c.vx * 0.2,
        -c.vy * 0.2,
        rand(10, 30),
      );
    if (Math.random() < 0.3 * q) fx.ember(c.x - cs * hl, c.y - sn * hl, c.z + 2);
  }
}

/** How high a shell landing in `t` seconds is now. */
function shellHeight(t: number): number {
  return t * 320;
}

/** The ones drawn as stacks: stick, bomb, hook, shells, the digger's hump and the turrets. */
export function queueArsenal(R: StackSink, art: Art, w: World): void {
  queueWild(R, art, w);
  const K = w.arsenal;
  for (const s of K.sticks)
    if (R.visible(s.x, s.y, 8, 12)) {
      R.group(s.y);
      R.stack(art.prop(s.def.id), s.x, s.y, s.z + 5, w.time * 26);
    }
  for (const t of K.toys)
    if (R.visible(t.x, t.y, 8, t.z + 12)) {
      R.group(t.y);
      R.stack(art.prop(t.def.id), t.x, t.y, t.level + t.z, w.time * 7);
    }
  for (const h of K.hooks)
    if (R.visible(h.x, h.y, 8, 10)) {
      R.group(h.y);
      R.stack(art.prop(h.def.id), h.x, h.y, h.z + 3, Math.atan2(h.vy, h.vx));
    }
  for (const t of K.tethers) {
    // the hook stays in the car it bit, on the side the line comes from
    const a = w.cars[t.a]!;
    const b = w.cars[t.b]!;
    const h = Math.atan2(b.y - a.y, b.x - a.x);
    const x = b.x - Math.cos(h) * 5;
    const y = b.y - Math.sin(h) * 5;
    if (!R.visible(x, y, 8, 10)) continue;
    R.group(y);
    R.stack(art.prop(t.def.id), x, y, b.z + 3, h);
  }
  for (const s of K.strikes) {
    const z = shellHeight(s.t);
    if (z > 240 || !R.visible(s.x, s.y, 8, z + 10)) continue;
    R.group(s.y);
    R.stack(art.prop(s.def.id), s.x, s.y, z, w.time * 5);
  }
  for (const m of K.moles)
    if (R.visible(m.x, m.y, 10, 6)) {
      R.group(m.y);
      R.stack(art.prop(m.def.id), m.x, m.y, 0, m.h);
    }
  for (const s of K.sentries)
    if (R.visible(s.x, s.y, 10, 8)) {
      R.group(s.y);
      // its eye blinks when the belt is nearly out
      const low = s.rounds < 8 && Math.floor(w.time * 8) % 2 === 0;
      R.stack(art.prop(s.def.id, low ? { minelit: 'black' } : undefined), s.x, s.y, 0, s.h);
    }
}

/** Light the lamps: the ray, the bolt, the fuse, the marks and the turrets' eyes. */
export function arsenalLights(
  L: { add(x: number, y: number, r: number, k: number, rgb: number): void },
  w: World,
): void {
  wildLights(L, w);
  const K = w.arsenal;
  for (const b of K.beams) {
    L.add(b.tx, b.ty, 30, 0.9, 0xff3020);
    L.add(b.x, b.y, 16, 0.6, 0xff3020);
  }
  for (const b of K.bolts) L.add(b.x, b.y, 24, 0.9, 0x60e8ff);
  for (const t of K.toys) L.add(t.x, t.y, 14, 0.6, 0xffc060);
  for (const s of K.strikes) L.add(s.x, s.y, 16, 0.4 + 0.5 * (1 - s.t / s.from), 0xff3020);
  for (const s of K.sentries) L.add(s.x, s.y, 12, 0.5, 0xff2a2a);
  for (const t of K.trails) {
    const c = w.cars[t.car]!;
    L.add(c.x, c.y, 28, 0.6, 0xff9030);
  }
}
