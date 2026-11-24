import { DT, type SimEvent } from '@demodogs/shared';
import { isArms, stickyAt, type World } from '@demodogs/sim';
import type { Art } from './art';
import type { Effects } from './effects';
import { CKind } from './pixel/cells';
import { HAZE, SOOT } from './pixel/particles';
import type { StackSink } from './stacks';
import type { Sound } from '../audio/sound';

/**
 * How the heavy arms look and sound: a jet of fire cells or glinting water, the rail's line of
 * light and its hanging smoke, the fire shell's fuse trail, the ball's dust, the sticky bomb's lamp.
 * Everything here is read from sim events and world state.
 */

const rand = (a: number, b: number) => a + Math.random() * (b - a);

const WATER = [0xbfe6ff, 0x8cc8ee, 0xe8f6ff] as const;
const RAIL = [0xffffff, 0xc8f0ff, 0x7fd8ff] as const;

/** A sim event for these arms: show it. Returns true if it was one of theirs. */
export function armsEvent(fx: Effects, w: World, e: SimEvent, S: Sound): boolean {
  const P = w.player;
  switch (e.t) {
    case 'fire': {
      const d = w.content.weapon.get(e.weapon);
      if (!d || !isArms(d.kind)) return false;
      const c = w.cars[e.car]!;
      const v = fx.vol(c.x, c.y);
      if (v <= 0) return true;
      if (d.kind === 'spray') S.hiss(v, !!d.lit);
      else if (d.kind === 'vortex') S.drop();
      else if (d.kind === 'lob') S.drop();
      else if (d.kind === 'ball') S.crash(30 * v);
      else if (d.kind === 'sticky') S.fire();
      return true;
    }
    case 'rail': {
      const dx = e.tx - e.x;
      const dy = e.ty - e.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      // the slug's path: a line of white-hot cells that fade, and a corkscrew of haze that hangs
      for (let s = 0; s < len; s += 1) {
        const x = e.x + ux * s;
        const y = e.y + uy * s;
        fx.emit(
          'spark',
          x,
          y,
          4.5,
          rand(-3, 3),
          rand(-3, 3),
          rand(-2, 4),
          rand(0.18, 0.45),
          1,
          RAIL[(Math.random() * 3) | 0]!,
        );
        if (s % 2 < 1) {
          const a = s * 0.35;
          fx.cells.add(
            CKind.Wisp,
            x - uy * Math.cos(a) * 2,
            y + ux * Math.cos(a) * 2,
            4.5 + Math.sin(a) * 2,
            rand(-2, 2),
            rand(-2, 2),
            rand(1, 5),
            rand(1.2, 2.4),
            Math.random() < 0.5 ? 0xb8d8e8 : 0x9ab0c0,
          );
        }
      }
      // a scorched groove down the road
      fx.paintGround((e.x + e.tx) / 2, (e.y + e.ty) / 2, len / 2 + 2, (g) => {
        g.fillStyle = 'rgba(14,12,10,0.45)';
        for (let s = 0; s < len; s += 1)
          if (Math.random() < 0.7)
            g.fillRect(Math.floor(e.x + ux * s), Math.floor(e.y + uy * s), 1, 1);
      });
      for (let i = 0; i < 14; i++) fx.spark(e.tx, e.ty, 4, 90);
      fx.flashes.push({ x: e.x, y: e.y, r: 34, life: 0.12, max: 0.12, rgb: 0xa8e8ff });
      fx.flashes.push({ x: e.tx, y: e.ty, r: 26, life: 0.2, max: 0.2, rgb: 0xa8e8ff });
      const v = Math.max(fx.vol(e.x, e.y), fx.vol(e.tx, e.ty));
      if (v > 0) S.railCrack(v);
      if (e.car === P.index) fx.shake = Math.max(fx.shake, 4);
      return true;
    }
    case 'stick': {
      for (let i = 0; i < 6; i++) fx.spark(e.x, e.y, 5, 30);
      if (e.car === P.index) fx.text(P.x, P.y, 'TICK ON YOU! RAM SOMEONE!', '#ff6a3d', true);
      else if (e.car >= 0 && w.arms.stickies.some((s) => s.car === e.car && s.owner === P.index))
        fx.text(e.x, e.y, 'TICKED!', '#ffd24a');
      const v = fx.vol(e.x, e.y);
      if (v > 0) S.drop();
      return true;
    }
    case 'pass': {
      for (let i = 0; i < 10; i++) fx.spark(e.x, e.y, 5, 60);
      if (e.from === P.index) fx.text(e.x, e.y, 'PASSED IT ON!', '#a6fbff', true);
      else if (e.to === P.index) fx.text(P.x, P.y, 'TICK ON YOU! RAM SOMEONE!', '#ff6a3d', true);
      const v = fx.vol(e.x, e.y);
      if (v > 0) S.pickup();
      return true;
    }
    case 'lightning': {
      // lightning: each jump a jagged line of single white-blue cells, with a fork or two
      const p = e.pts;
      for (let i = 2; i < p.length; i += 2) {
        bolt(fx, p[i - 2]!, p[i - 1]!, p[i]!, p[i + 1]!, i === 2 ? 9 : 7);
        fx.flashes.push({ x: p[i]!, y: p[i + 1]!, r: 30, life: 0.08, max: 0.08, rgb: 0x9ad8ff });
        for (let k = 0; k < 3; k++) fx.spark(p[i]!, p[i + 1]!, 5, 50);
      }
      const v = fx.vol(p[0]!, p[1]!);
      if (v > 0) S.crackle(v);
      const hit = p.length > 4 || w.cars.some((c) => c.x === p[2] && c.y === p[3]);
      if (!hit) fx.scorch(p[2]!, p[3]!, 3);
      return true;
    }
    case 'orb': {
      fx.flashes.push({ x: e.x, y: e.y, r: e.r, life: 0.3, max: 0.3, rgb: 0xb070ff });
      const v = fx.vol(e.x, e.y);
      if (v > 0) S.whoosh(v);
      return true;
    }
    case 'splash': {
      if (e.lit) {
        fx.flame(e.x, e.y, rand(2, 5), rand(3, 5));
        if (Math.random() < 0.3) fx.ember(e.x, e.y, 5);
      } else
        for (let i = 0; i < 4; i++)
          fx.emit(
            'spark',
            e.x,
            e.y,
            rand(2, 5),
            rand(-40, 40),
            rand(-40, 40),
            rand(30, 80),
            rand(0.2, 0.4),
            1,
            WATER[i % 3]!,
          );
      return true;
    }
    default:
      return false;
  }
}

/**
 * A jagged bolt from (x0, y0) to (x1, y1), `z` art px up: the line broken by midpoint jitter into
 * single cells, and now and then a short fork off it.
 */
function bolt(fx: Effects, x0: number, y0: number, x1: number, y1: number, z: number): void {
  const pts: [number, number][] = [
    [x0, y0],
    [x1, y1],
  ];
  // midpoint displacement, four rounds
  let jit = Math.hypot(x1 - x0, y1 - y0) * 0.18;
  for (let r = 0; r < 4; r++) {
    for (let i = pts.length - 1; i > 0; i--) {
      const [ax, ay] = pts[i - 1]!;
      const [bx, by] = pts[i]!;
      const len = Math.hypot(bx - ax, by - ay) || 1;
      const off = rand(-1, 1) * jit;
      pts.splice(i, 0, [
        (ax + bx) / 2 - ((by - ay) / len) * off,
        (ay + by) / 2 + ((bx - ax) / len) * off,
      ]);
    }
    jit *= 0.5;
  }
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1]!;
    const [bx, by] = pts[i]!;
    const len = Math.hypot(bx - ax, by - ay);
    for (let s = 0; s < len; s += 0.8) {
      const t = s / (len || 1);
      fx.emit(
        'spark',
        ax + (bx - ax) * t,
        ay + (by - ay) * t,
        z + rand(-0.5, 0.5),
        0,
        0,
        0,
        rand(0.06, 0.14),
        1,
        Math.random() < 0.6 ? 0xffffff : 0x8fd0ff,
      );
    }
    // a fork: a short spur off the bolt that dies out
    if (Math.random() < 0.12) {
      let fxp = bx;
      let fyp = by;
      const a = rand(0, Math.PI * 2);
      for (let k = 0; k < 7; k++) {
        fxp += Math.cos(a + rand(-0.6, 0.6)) * 1.2;
        fyp += Math.sin(a + rand(-0.6, 0.6)) * 1.2;
        fx.emit('spark', fxp, fyp, z, 0, 0, 0, rand(0.05, 0.1), 1, 0x8fd0ff);
      }
    }
  }
}

/** Each tick: the jets, the shells' fuses, the balls' dust and the bombs' lamps. */
export function armsTick(fx: Effects, w: World, S: Sound): void {
  const A = w.arms;
  const q = fx.quality;
  for (const g of A.gobs) {
    if (g.def.lit) {
      // burning fuel: hot cells that the air curls as they go, white near the nozzle
      const young = g.t > 0.35;
      for (let n = 0; n < (young ? 2 : 1) * q + 0.5; n++)
        fx.cells.add(
          young && Math.random() < 0.4 ? CKind.Bang : CKind.Fire,
          g.x + rand(-1.5, 1.5),
          g.y + rand(-1.5, 1.5),
          g.z + rand(-1, 1),
          g.vx * 0.55 + rand(-10, 10),
          g.vy * 0.55 + rand(-10, 10),
          g.vz * 0.3 + rand(0, 16),
          rand(0.25, 0.6),
        );
      if (Math.random() < 0.08 * q) fx.plume(g.x, g.y, g.z + 3, 2.5, SOOT, 14);
    } else {
      fx.emit(
        'spark',
        g.x,
        g.y,
        g.z,
        g.vx * 0.3,
        g.vy * 0.3,
        g.vz,
        rand(0.08, 0.16),
        1,
        WATER[(Math.random() * 3) | 0]!,
      );
      if (Math.random() < 0.12 * q)
        fx.cells.add(
          CKind.Wisp,
          g.x,
          g.y,
          g.z,
          g.vx * 0.2,
          g.vy * 0.2,
          rand(2, 8),
          rand(0.5, 1.1),
          0xd8e8f0,
        );
    }
  }
  for (const s of A.shells) {
    // the fuse fizzes and the shell trails smoke as it tumbles
    fx.emit(
      'spark',
      s.x,
      s.y,
      s.z + 5,
      rand(-20, 20),
      rand(-20, 20),
      rand(10, 40),
      0.25,
      1,
      0xffd070,
    );
    if (Math.random() < 0.6) fx.plume(s.x, s.y, s.z + 3, 2, HAZE, 4);
  }
  for (const b of A.balls) {
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > 60 && Math.random() < 0.5)
      fx.puff(b.x - (b.vx / sp) * 4, b.y - (b.vy / sp) * 4, 1, 'dust');
    if (sp > 120 && Math.random() < 0.15) fx.spark(b.x, b.y, 1, 30);
  }
  for (const o of A.orbs) {
    if (o.drift > 0) {
      // in flight: a dark core trailing violet sparks
      fx.emit('spark', o.x, o.y, 5, rand(-10, 10), rand(-10, 10), rand(-5, 5), 0.2, 1, 0xc8a0ff);
      continue;
    }
    const R = o.def.radius ?? 70;
    const k = Math.min(1, o.t / 0.6);
    // everything loose in the air near it is dragged round and in: smoke, fire, leaves, sparks, bits
    fx.cells.swirl(o.x, o.y, R, 70 * k, DT);
    for (const p of fx.fx) swirlOne(p, o.x, o.y, R, 90 * k);
    for (const v of fx.voxels) swirlOne(v, o.x, o.y, R, 120 * k);
    for (const d of fx.debris) swirlOne(d, o.x, o.y, R, 80 * k);
    // dust torn up off the ground at the rim, spiralling in
    for (let n = 0; n < 6 * q; n++) {
      const a = rand(0, Math.PI * 2);
      const d = R * rand(0.6, 1);
      fx.cells.add(
        CKind.Wisp,
        o.x + Math.cos(a) * d,
        o.y + Math.sin(a) * d,
        rand(0, 3),
        0,
        0,
        rand(0, 6),
        rand(0.8, 1.6),
        Math.random() < 0.5 ? 0x6a5a78 : 0x9a8a70,
      );
    }
    // the heart: violet cells in a tight orbit
    for (let n = 0; n < 5; n++) {
      const a = rand(0, Math.PI * 2);
      const d = rand(2, 6);
      fx.emit(
        'spark',
        o.x + Math.cos(a) * d,
        o.y + Math.sin(a) * d,
        rand(3, 8),
        -Math.sin(a) * 60,
        Math.cos(a) * 60,
        0,
        rand(0.1, 0.25),
        1,
        Math.random() < 0.5 ? 0xe0c8ff : 0x9a60ff,
      );
    }
  }
  for (const s of A.stickies) {
    if (s.flying) continue;
    const [x, y] = stickyAt(w, s);
    // the lamp blinks faster as the fuse runs down; each blink a tiny blip if it is close
    const rate = s.fuse < 0.8 ? 12 : s.fuse < 1.6 ? 6 : 3;
    const now = Math.floor(w.time * rate);
    if (now !== Math.floor((w.time - 1 / 60) * rate) && now % 2 === 0) {
      const v = fx.vol(x, y);
      if (v > 0.3) S.tick(s.fuse < 0.8, v);
      fx.flashes.push({ x, y, r: 14, life: 0.06, max: 0.06, rgb: 0xff3020 });
    }
  }
}

/** Carry one loose thing round a whirlpool and in towards it, and lift it a little. */
function swirlOne(
  p: { x: number; y: number; vx: number; vy: number; vz: number },
  x: number,
  y: number,
  R: number,
  k: number,
): void {
  const dx = x - p.x;
  const dy = y - p.y;
  if (Math.abs(dx) > R || Math.abs(dy) > R) return;
  const d = Math.hypot(dx, dy);
  if (d > R || d < 2) return;
  const s = (k * (0.4 + 1.6 * (1 - d / R)) * DT) / d;
  p.x += (dx * 0.7 - dy) * s;
  p.y += (dy * 0.7 + dx) * s;
  p.vz += 30 * (1 - d / R) * DT;
}

/** The arms that are drawn as stacks: rolling balls, shells in the air and the sticky bombs. */
export function queueArms(R: StackSink, art: Art, w: World): void {
  const A = w.arms;
  for (const b of A.balls)
    if (R.visible(b.x, b.y, 8, 10)) {
      R.group(b.y);
      R.stack(
        art.prop(b.def.id),
        b.x,
        b.y,
        0,
        Math.atan2(b.vy, b.vx) + b.roll / (b.def.radius ?? 4.5),
      );
    }
  for (const s of A.shells)
    if (R.visible(s.x, s.y, 8, s.z + 8)) {
      R.group(s.y);
      R.stack(art.prop(s.def.id), s.x, s.y, s.z, w.time * 9);
    }
  for (const s of A.stickies) {
    const [x, y] = stickyAt(w, s);
    if (!R.visible(x, y, 6, 16)) continue;
    const c = s.car >= 0 ? w.cars[s.car]! : null;
    const rate = s.fuse < 0.8 ? 12 : s.fuse < 1.6 ? 6 : 3;
    const on = s.flying || Math.floor(w.time * rate) % 2 === 0;
    R.group(y + 1);
    R.stack(
      on ? art.prop(s.def.id) : art.prop(s.def.id, { minelit: 'black' }),
      x,
      y,
      c ? c.z + (c.def.top.z + 1) * c.size : s.flying ? 4 : 0,
      c ? c.h : Math.atan2(s.vy, s.vx),
    );
  }
}

/** Light the lamps: the jet of fire, the fuse, the bomb's blink. */
export function armsLights(
  L: { add(x: number, y: number, r: number, k: number, rgb: number): void },
  w: World,
): void {
  const A = w.arms;
  for (let i = 0; i < A.gobs.length; i += 6) {
    const g = A.gobs[i]!;
    if (g.def.lit) L.add(g.x, g.y, 26, 0.55, 0xff9030);
  }
  for (const s of A.shells) L.add(s.x, s.y, 16, 0.6, 0xffc060);
  for (const o of A.orbs) L.add(o.x, o.y, o.drift > 0 ? 18 : 40, 0.8, 0xa060ff);
  for (const k of A.coils) {
    const c = w.cars[k.car]!;
    L.add(c.x, c.y, 30, 0.5 + Math.sin(w.time * 50) * 0.3, 0x8fd0ff);
  }
  for (const s of A.stickies) {
    const rate = s.fuse < 0.8 ? 12 : s.fuse < 1.6 ? 6 : 3;
    if (s.flying || Math.floor(w.time * rate) % 2) continue;
    const [x, y] = stickyAt(w, s);
    L.add(x, y, 18, 0.9, 0xff2020);
  }
}
