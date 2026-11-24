import { fitted, mounts, place } from './addon-mounts';
import {
  pressOpen,
  pressWarning,
  type Bot,
  type Car,
  type Critter,
  type StaticProp,
  type World,
} from '@demodogs/sim';
import type { Art } from './art';
import { queueToppling } from './collapse';
import type { Effects } from './effects';
import { queueRig, rigTall, tickBones } from './bones';
import { pose } from './rig';
import { tall, type Strip } from './stack';
import { queueArms } from './arms-fx';
import { queueArsenal } from './arsenal-fx';
import { leanAt } from './rubble';
import { Builder } from './slice-fx';
import { queueDecoys, queueGuards } from './guard-mounts';
import { BREEZE, WIND } from './pixel/particles';

const MINE_OFF = { minelit: 'black' };
/** The line round your own car. */
const RIM = 0xf4f0e0;

/**
 * Where a frame's stacks go: the canvas `StackRenderer` (which sorts them) or the pixel engine's
 * `StackBatch` (which depth-tests them on the GPU). Both take the same calls.
 */
export interface StackSink {
  visible(x: number, y: number, rad: number, ht?: number): boolean;
  /** Start an object at ground depth `key` (the canvas renderer sorts by it; the GPU ignores it). */
  group(key: number): void;
  /** One slice with its underside at height z (art px); `thick` in layers of the strip. */
  slice(
    s: Strip,
    i: number,
    x: number,
    y: number,
    z: number,
    rot: number,
    thick?: number,
    alpha?: number,
  ): void;
  stack(s: Strip, x: number, y: number, z: number, rot: number, alpha?: number): void;
  /**
   * Draw the slices and stacks that follow `k` times their size: the same art with pixels `k`
   * times as big (a swollen car, a shrunk one). 1 puts it back.
   */
  zoom(k: number): void;
  limb(s: Strip, a: readonly number[], b: readonly number[], n: number): void;
  /** Where the next slice will go, and a line round everything queued since (the pixel engine). */
  mark?(): number;
  rim?(from: number, rgb: number): void;
  /** What is queued while this is on is warm and moving (a car): snow hardly lies on it. */
  warm?(on: boolean): void;
  /** Should your own car get a line round it this frame? */
  readonly rimOn?: boolean;
}

/** A static prop that never moves or sways: the canvas renderer draws it as one baked image. */
export type StaticHook = (s: StaticProp, strip: Strip) => boolean;

/** How solid a thing is drawn when it hides your car: a crown, a deck, anything tall in front of it. */
const THROUGH = 0.4;

/** What is being built slice by slice goes through this on its way to the sink. */
const builder = new Builder();

/** `R`, or the builder in front of it while `o` (`height` art px tall) is being built. */
function built(R: StackSink, fx: Effects, o: object, height: number): StackSink {
  const b = fx.slices.building(o, height);
  return b ? builder.into(R, b, fx.slices.now - b.t0) : R;
}

/** Every stack in the world, in a fixed order, into `R`. */
export function queueStacks(
  R: StackSink,
  art: Art,
  w: World,
  fx: Effects,
  still?: StaticHook,
): void {
  // a crown you are driving under thins out so you can see your car through it
  const P = w.player;
  tickBones(w.time);
  for (const s of w.statics) if (!s.down) queueStatic(R, art, w, fx, s, P, still);
  queueToppling(R, fx.toppling);
  // what has just come down, whole for the moment before it cracks apart
  for (const f of fx.wreck.falling) {
    const { o, strip } = f;
    const lift = o.lift ?? 0;
    if (!R.visible(o.x, o.y, 40, tall(strip) + lift)) continue;
    R.group(o.y);
    for (let i = Math.max(0, Math.ceil(-lift * strip.res)); i < strip.n; i++)
      R.slice(strip, i, o.x, o.y, lift + i / strip.res, o.rot);
  }
  // its pieces: falling, lying in the rubble (leaning as they came to rest), or flying home
  for (const p of fx.wreck.pieces) {
    if (!R.visible(p.x, p.y, p.r + 8, p.z + p.tall)) continue;
    R.group(p.y);
    const strip = p.strip;
    for (let i = 0; i < strip.n; i++) {
      const [x, y, z] = leanAt(p, i / strip.res);
      R.slice(strip, i, x, y, z, p.rot);
    }
  }
  for (const p of w.props)
    if (p.alive && R.visible(p.x, p.y, 8, 10 + p.z)) {
      R.group(p.y);
      const strip = art.prop(p.def.id);
      built(R, fx, p, tall(strip)).stack(strip, p.x, p.y, p.z, p.rot);
    }
  const t = w.time;
  for (const p of w.pickups)
    if (p.on && R.visible(p.x, p.y, 8, 12 + p.z)) {
      R.group(p.y);
      // one that has just come back is built where it floats, slice by slice
      const B = fx.slices.building(p, tall(art.pickup));
      const z = p.z + 2.5 + Math.sin(t * 3 + p.x) * 1.5;
      if (B) B.base = z;
      (B ? builder.into(R, B, fx.slices.now - B.t0) : R).stack(
        art.pickup,
        p.x,
        p.y,
        z,
        t * 1.8 + p.y,
      );
    }
  for (const m of w.mines)
    if (R.visible(m.x, m.y, 6)) {
      R.group(m.y - 5);
      R.stack(
        Math.floor(m.t * 4) % 2 ? art.prop(m.def.id) : art.prop(m.def.id, MINE_OFF),
        m.x,
        m.y,
        m.z,
        0,
      );
    }
  // tacks lie flat, each turned its own way
  for (const s of w.spikes)
    if (R.visible(s.x, s.y, 4)) {
      R.group(s.y - 5);
      R.stack(art.prop(s.def.id), s.x, s.y, 0, (s.x * 7.3 + s.y * 3.1) % (Math.PI * 2));
    }
  for (const r of w.rockets) {
    R.group(r.y);
    R.stack(art.prop(r.def.id), r.x, r.y, r.z + 4, r.h);
  }
  queueArms(R, art, w);
  queueDecoys(R, art, w);
  queueArsenal(R, art, w);
  for (const b of w.bots) queueBot(built(R, fx, b, 16), art, fx, b);
  for (const k of w.critters) queueCritter(R, art, w, k);
  for (const d of fx.debris)
    if (R.visible(d.x, d.y, 8, 10)) {
      R.group(d.y);
      R.stack(d.strip, d.x, d.y, d.z, d.rot, d.life < 1.5 ? d.life / 1.5 : 1);
    }
  R.warm?.(true);
  for (const c of w.cars) queueCar(built(R, fx, c, 16 * c.size), art, w, fx, c);
  R.warm?.(false);
}

/** How far (art px) a piece of deck has sunk, `t` seconds after it lost its footing. */
export function sagDip(t: number): number {
  return Math.min(7, 1.5 + 9 * t);
}

/** How many of a static's slices still stand: all of them, unless it is a building short of floors. */
export function standing(s: StaticProp, strip: Strip): number {
  const n = s.def.storeys;
  if (!n || s.storeys === undefined || s.storeys >= n) return strip.n;
  return Math.round(s.storeys * (s.def.fallOver?.floor ?? 4) * strip.res);
}

function queueStatic(
  R: StackSink,
  art: Art,
  w: World,
  fx: Effects,
  s: StaticProp,
  P: Car,
  still?: StaticHook,
): void {
  if (s.def.pad) {
    queuePad(R, art, w, s);
    return;
  }
  const strip = fx.scarred.get(s) ?? art.prop(s.def.id);
  // bridge deck with nothing under it sinks and shudders before it goes
  const sag = s.sagT === undefined ? 0 : sagDip(s.sag ?? 0);
  const lift = (s.lift ?? 0) - sag;
  // something with moving parts, while it is whole: once it is hurt it is one piece, and stops
  const rig = lift === 0 && strip === art.prop(s.def.id) ? art.rig(s.def.id) : null;
  if (rig) {
    const r = Math.max(s.def.radius + 12, Math.hypot(strip.cw, strip.ch) / strip.res / 2 + 2);
    if (!R.visible(s.x, s.y, r, rigTall(rig))) return;
    R.group(s.y);
    queueRig(R, rig, s.x, s.y, 0, s.rot, 1, w.time, s.seed, s, w.cars);
    return;
  }
  if (!R.visible(s.x, s.y, s.def.radius + 12, tall(strip) + lift)) return;
  R.group(s.y);
  // just put down (the track creator, the test range): it goes up slice by slice
  const B = fx.slices.building(s, tall(strip));
  if (B) {
    B.base = lift;
    R = builder.into(R, B, fx.slices.now - B.t0);
    still = undefined;
  }
  const lost = standing(s, strip);
  if (lost < strip.n) {
    // a building that has lost floors: only what still stands
    const a = lift === 0 && fx.slices.hides(s, strip, lost, P) ? THROUGH : 1;
    for (let i = 0; i < lost; i++) R.slice(strip, i, s.x, s.y, lift + i / strip.res, s.rot, 1, a);
    return;
  }
  if (lift !== 0) {
    // stood up off the ground: a deck piece or a crown up in a tree. Slices that would be under
    // the ground (the foot of a ramp) are left out.
    const alpha = over(s, strip, lift, P) ? THROUGH : 1;
    const from = Math.max(0, Math.ceil(-lift * strip.res));
    const [wx, wy] = s.def.sway
      ? sway(w.time, s.seed)
      : sag > 0
        ? [Math.sin(w.time * 47 + s.seed * 9) * 0.35, Math.cos(w.time * 53 + s.seed * 5) * 0.35]
        : STILL;
    for (let i = from; i < strip.n; i++) {
      const o = (0.5 + (0.5 * i) / strip.n) * 1.6;
      R.slice(strip, i, s.x + wx * o, s.y + wy * o, lift + i / strip.res, s.rot, 1, alpha);
    }
    return;
  }
  // tall, and your car is behind it: seen through, the way a crown or a deck over the car is
  if (fx.slices.hides(s, strip, strip.n, P)) {
    const [wx, wy] = s.def.sway ? sway(w.time, s.seed) : STILL;
    for (let i = 0; i < strip.n; i++) {
      const k = i / strip.n;
      const o = k * k * 1.8;
      R.slice(strip, i, s.x + wx * o, s.y + wy * o, i / strip.res, s.rot, 1, THROUGH);
    }
    if (s.def.press) queuePress(R, art, w, s);
    return;
  }
  if (!s.def.sway) {
    if (!still?.(s, strip)) R.stack(strip, s.x, s.y, 0, s.rot);
    if (s.def.press) queuePress(R, art, w, s);
    return;
  }
  // trees sway: the higher the slice, the further it moves
  const [wx, wy] = sway(w.time, s.seed);
  for (let i = 0; i < strip.n; i++) {
    const k = i / strip.n;
    const o = k * k * 1.8;
    R.slice(strip, i, s.x + wx * o, s.y + wy * o, i / strip.res, s.rot);
  }
}

/** Steps of a tile's running light a second. */
const PAD_RATE = 9;

/**
 * A track tile lying on the road: a boost tile's light runs along its arrows (its look's poses,
 * in turn); a ramp just stands there.
 */
function queuePad(R: StackSink, art: Art, w: World, s: StaticProp): void {
  if (!R.visible(s.x, s.y, s.def.radius + 12, 12)) return;
  // under everything that drives over it
  R.group(s.y - 40);
  const n = art.poses(s.def.id);
  const pose = n > 1 ? Math.floor(w.time * PAD_RATE + s.seed) % n : 0;
  R.stack(art.prop(s.def.id, undefined, pose), s.x, s.y, 0, s.rot);
}

/**
 * An animal: on the ground it steps from one pose to the other as it goes and bobs with its gait;
 * knocked into the air it spins; a bird on the wing beats between its two flying poses.
 */
function queueCritter(R: StackSink, art: Art, w: World, k: Critter): void {
  if (!R.visible(k.x, k.y, 12, 14 + k.z)) return;
  R.group(k.y);
  const D = k.def.critter!;
  const id = k.def.id;
  const flier = D.kind === 'bird';
  // a walker's poses are the steps of one stride, in order; a bird's are standing, wings up, down
  const n = art.poses(id);
  let pose = 0;
  let z = k.z;
  let rot = k.h;
  if (k.state === 'fly') pose = 1 + (Math.floor(w.time * 9 + k.index * 0.37) & 1);
  else if (k.state === 'air') {
    rot += w.time * 17 + k.index;
    pose = flier ? 1 + (Math.floor(w.time * 16) & 1) : Math.floor(w.time * 7 * n) % n;
  } else if (k.state === 'wind') {
    // pawing the ground: stamping from foot to foot, shuddering, head down
    pose = (Math.floor(w.time * 10) & 1) * Math.max(1, n >> 2);
    rot += Math.sin(w.time * 40) * 0.06;
  } else if (k.state !== 'idle') {
    // one step each time it has gone about its own length, a stride every two
    const ph = k.gait / Math.max(1.6, k.def.radius * 1.5);
    pose = flier ? 0 : Math.floor((ph * n) / 2) % n;
    z += Math.abs(Math.sin(ph * Math.PI)) * D.step;
  } else if (!flier && Math.sin(w.time * 1.7 + k.index * 2.4) > 0.86) pose = 1;
  const rig = art.rig(id);
  if (rig) {
    // thrown through the air it has other things on its mind than watching the cars
    const seen = k.state === 'air' ? null : w.cars;
    queueRig(R, rig, k.x, k.y, z, rot, 1, w.time, k.index, k, seen, pose);
    return;
  }
  R.stack(art.prop(id, undefined, pose), k.x, k.y, z, rot);
}

/** A press's ram, as high as the sim says it is, shuddering just before it drops. */
function queuePress(R: StackSink, art: Art, w: World, s: StaticProp): void {
  const P = s.def.press!;
  const t = w.time;
  const shake = pressWarning(w, s) ? Math.sin(t * 90) * 0.5 : 0;
  R.stack(art.prop(P.plate), s.x + shake, s.y, 1 + P.lift * pressOpen(w, s), s.rot);
}

const STILL: readonly [number, number] = [0, 0];
const CALM = Math.hypot(BREEZE[0], BREEZE[1]);

/**
 * How far the wind has a tree over, for its phase `seed`: it rocks as it always has in the
 * breeze, and in a real wind (a gale's gust) it rocks harder, faster, and leans downwind.
 */
function sway(t: number, seed: number): readonly [number, number] {
  const gale = Math.max(0, Math.hypot(WIND[0], WIND[1]) / CALM - 1);
  const q = 1 + gale * 0.35;
  const rock =
    (Math.sin(t * 1.3 * q + seed) * 0.9 + Math.sin(t * 2.9 * q + seed * 2) * 0.3) *
    (1 + gale * 0.25);
  const lean = gale * 0.022;
  return [rock + (WIND[0] - BREEZE[0]) * lean, rock * 0.4 + (WIND[1] - BREEZE[1]) * lean];
}

/** cot of the camera pitch: how far north on the ground a thing at height 1 is drawn over. */
const OVER = 0.67;

/**
 * Is the player's car under this lifted piece (a crown, a deck), so that it would hide it? The
 * piece is drawn lifted on screen, so it hides what is a little north of it on the ground.
 */
function over(s: StaticProp, strip: Strip, lift: number, P: Car): boolean {
  if (P.z > lift) return false;
  const dx = P.x - s.x;
  const dy = P.y + lift * OVER - s.y;
  if (s.def.crown) return Math.hypot(dx, dy) < strip.cw / strip.res / 2 + 5;
  // a deck piece: thin out a stretch either side of the car, the whole width of the road
  const cs = Math.cos(s.rot);
  const sn = Math.sin(s.rot);
  return (
    Math.abs(dx * cs + dy * sn) < 22 && Math.abs(-dx * sn + dy * cs) < strip.ch / strip.res / 2
  );
}

function queueCar(R: StackSink, art: Art, w: World, fx: Effects, c: Car): void {
  // a swollen or shrunk car is the same car drawn with bigger or smaller pixels: everything about
  // it is laid out `k` times as far from its middle. One flattened by a bigger car is a little
  // is spread out like a pancake, `flat` times as tall.
  const flat = squashed(c);
  // going down a pit: it tips over the edge the way it went in, and gets small and dark
  const fall = falling(c);
  if (fall >= 1) return;
  const k = c.size * (1 + (1 - Math.min(1, flat)) * 0.95) * (1 - 0.8 * fall ** 1.5);
  if (!R.visible(c.x, c.y, 20 * k, 14 * k)) return;
  R.group(c.y);
  if (c.collar) queueCollar(R, art, fx, c);
  const from = R.rimOn && c === w.player && !c.wrecked ? R.mark?.() : undefined;
  R.zoom(k);
  const A = fx.carArt(c);
  const body = fx.bodies[c.index]!;
  const D = c.def;
  const cs = Math.cos(c.h) * k;
  const sn = Math.sin(c.h) * k;
  const alpha =
    fall > 0
      ? 1 - 0.85 * Math.max(0, (fall - 0.4) / 0.6)
      : c.invuln > 0 && !((c.sunk ?? 0) > 0) && Math.floor(w.time * 12) % 2
        ? 0.4
        : 1;
  // the end that went over first drops and the other end kicks up
  const tip = Math.sin(Math.min(1, fall * 1.8) * Math.PI * 0.5) * 3.5;
  const roll = c.roll + (c.sunkTip?.[1] ?? 0) * tip;
  const lurch = c.lurch + (c.sunkTip?.[0] ?? 0) * tip;
  const wheel = art.wheels[((Math.floor(c.wheelDist / 2.2 / k) % 3) + 3) % 3]!;
  const z = c.z + Math.sin(Math.min(1, fall * 2) * Math.PI) * 4;
  // the wheels go some of the way with a body that is tipping in
  const wtx = ((c.sunkTip?.[0] ?? 0) * cs - (c.sunkTip?.[1] ?? 0) * sn) * tip * 0.3;
  const wty = ((c.sunkTip?.[0] ?? 0) * sn + (c.sunkTip?.[1] ?? 0) * cs) * tip * 0.3;
  for (const wh of D.wheels)
    for (const sg of [-1, 1]) {
      const wx = wh[0];
      const wy = wh[1] * sg;
      const steer = wx > 0 && !c.wrecked ? c.steer * 0.45 : 0;
      R.stack(
        wheel,
        c.x + cs * wx - sn * wy + wtx,
        c.y + sn * wx + cs * wy + wty,
        z,
        c.h + steer,
        alpha,
      );
    }
  // the body: each slice shifted a little more than the one below, so it leans and squats
  const rx = -sn;
  const ry = cs;
  const up = k * flat;
  for (let i = 0; i < body.n; i++) {
    const t = i / (body.n - 1);
    const o = roll * t * flat;
    const l = lurch * t * flat;
    R.slice(
      body,
      i,
      c.x + rx * o + cs * l,
      c.y + ry * o + sn * l,
      z + (0.6 + i / body.res + c.bounce) * up,
      c.h,
      flat,
      alpha,
    );
  }
  const a = D.body.halfLength - 0.1;
  const o = roll * flat;
  const l = lurch * flat;
  const bz = z + (1.4 + c.bounce) * up;
  if (c.has.front && flat >= 1)
    R.stack(A.bumper, c.x + cs * a + rx * o * 0.15, c.y + sn * a + ry * o * 0.15, bz, c.h, alpha);
  if (c.has.rear && flat >= 1)
    R.stack(A.bumper, c.x - cs * a + rx * o * 0.15, c.y - sn * a + ry * o * 0.15, bz, c.h, alpha);
  // a blade on the nose, and coil springs under the wheels through a sprung leap
  if (c.blade) {
    const b = D.body.halfLength + 1.4;
    R.stack(
      art.prop(c.blade.def.id),
      c.x + cs * b,
      c.y + sn * b,
      z + (0.4 + c.bounce) * up,
      c.h,
      alpha,
    );
  }
  // the nose gun: a barrel on each side of the bonnet, the one that just fired kicked back
  if (c.gun && !c.wrecked && flat >= 1) {
    const gun = art.prop(c.gun.id);
    const [gx, gy, gz] = art.gunMount(D.id, D.body);
    for (const side of [-1, 1]) {
      const lx = gx - fx.gunKick(c, side) * 2;
      const ly = side * gy + roll * 0.6;
      R.stack(
        gun,
        c.x + cs * lx - sn * ly,
        c.y + sn * lx + cs * ly,
        z + (0.5 + c.bounce + gz) * up,
        c.h,
        alpha,
      );
    }
  }
  queueGuards(R, art, w, fx, c, alpha, k, up, z);
  if (c.springs && c.hop >= 0 && c.hop < 0.4) {
    const coil = art.prop(c.springs.def.id);
    const cz = Math.max(0, z - 4 * k);
    for (const wh of D.wheels)
      for (const sg of [-1, 1]) {
        const wx = wh[0];
        const wy = wh[1] * sg * 0.7;
        R.stack(coil, c.x + cs * wx - sn * wy, c.y + sn * wx + cs * wy, cz, c.h, alpha);
      }
  }
  // add-ons: each piece where the car's own shape puts it, at the size the car is just now; a
  // wreck's have been blown off it
  if (!c.wrecked && flat >= 1)
    for (const kind of fitted(c)) {
      const strip = art.prop(c.fit[kind]!.def.id);
      for (const m of mounts(c, kind, A.body)) {
        const [x, y, mz, rot] = place(c, m, k, up, z);
        R.stack(strip, x, y, mz + c.bounce * up, rot, alpha);
      }
    }
  if (c.has.top && flat >= 1)
    R.stack(
      A.top,
      c.x + cs * (D.top.x + l) + rx * o,
      c.y + sn * (D.top.x + l) + ry * o,
      z + (0.6 + D.top.z + c.bounce) * up,
      c.h,
      alpha,
    );
  R.zoom(1);
  // your own car, when it is dark enough to lose it: a pale line round the whole of it
  if (from !== undefined) R.rim?.(from, RIM);
}

/** How far down a pit a car is: 0 not at all, 1 out of sight. */
export function falling(c: Car): number {
  if (c.buried) return Math.min(1, c.wreckT / 0.5);
  if ((c.sunk ?? 0) > 0) return Math.min(1, ((c.sunkFrom ?? 0) - c.sunk!) / 0.5);
  return 0;
}

/** How tall a car stands for being flattened: 1 untouched, an eighth while flat, springing back at the end. */
function squashed(c: Car): number {
  if (c.squashT <= 0) return 1;
  if (c.squashT > 0.3) return 0.12;
  // it pops back up past its own height, and settles
  const t = 1 - c.squashT / 0.3;
  return 0.12 + 0.88 * t + Math.sin(t * Math.PI) * 0.45;
}

/** A lead collar's ball, dragged along the ground behind the car on its chain of links. */
function queueCollar(R: StackSink, art: Art, fx: Effects, c: Car): void {
  const B = fx.catchup.ball(c);
  const ball = art.prop(c.collar!.def.id);
  R.stack(ball, B.x, B.y, B.z, B.rot);
  // the chain: single dark links from the back bumper down to the ball's shackle
  const tail = c.def.body.halfLength * c.size;
  const ax = c.x - Math.cos(c.h) * tail;
  const ay = c.y - Math.sin(c.h) * tail;
  const n = 5;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    R.stack(art.link, ax + (B.x - ax) * t, ay + (B.y - ay) * t, c.z + 2 + (B.z + 4 - c.z) * t, c.h);
  }
}

function queueBot(R: StackSink, art: Art, fx: Effects, b: Bot): void {
  if (!b.alive || !R.visible(b.x, b.y, 10, 14)) return;
  R.group(b.y);
  const P = pose(fx.walkers[b.index]!);
  const A = art.bot(b.def.id, b.paint);
  for (const L of P.legs) {
    R.stack(A.foot, L.sole[0], L.sole[1], L.sole[2], L.rot);
    R.limb(A.limb, L.ankle, L.knee, 3);
    R.limb(A.limb, L.knee, L.hip, 3);
  }
  const z0 = P.pelvis[2] - 1;
  const a = P.heading + (P.hipsAngle - P.heading) * 0.6;
  R.stack(A.body, P.x, P.y, z0, a);
  R.stack(A.aerial, P.x - Math.cos(a) * 1.4, P.y - Math.sin(a) * 1.4, z0 + tall(A.body), a);
}

/** A soft shadow on the ground: centre, radii (art px) along and across `rot`, opacity; `box`: square. */
export type ShadowFn = (
  x: number,
  y: number,
  rx: number,
  ry: number,
  rot: number,
  alpha: number,
  box?: boolean,
) => void;

/** Shadows under trees, cars and bots. */
export function queueShadows(
  R: Pick<StackSink, 'visible'>,
  art: Art,
  w: World,
  /** Scenery whose shadow is cast from its own shape elsewhere (the pixel engine's ShadowMap). */
  cast: ((s: StaticProp) => boolean) | null,
  shadow: ShadowFn,
): void {
  for (const s of w.statics) {
    if (s.down || cast?.(s)) continue;
    const lift = s.lift ?? 0;
    if (lift > 0) {
      // things up high throw their shadow further off, so you can tell how high they are
      const x = s.x + 3 + lift * 0.3;
      const y = s.y + 2 + lift * 0.2;
      if (!R.visible(x, y, 40)) continue;
      const st = art.prop(s.def.id);
      if (s.def.crown) shadow(x, y, (st.cw / st.res) * 0.42, (st.ch / st.res) * 0.38, 0, 0.2);
      else shadow(x, y, st.cw / st.res / 2, st.ch / st.res / 2 - 2, s.rot, 0.24, true);
      continue;
    }
    if (s.def.sway && R.visible(s.x, s.y, 14)) {
      const st = art.prop(s.def.id);
      shadow(s.x + 3, s.y + 2, (st.cw / st.res) * 0.45, (st.ch / st.res) * 0.4, 0, 0.22);
    }
  }
  for (const c of w.cars)
    // a car up on a deck has its shadow on the deck, which the ground's shadows cannot reach
    if (c.deck < 4 && falling(c) === 0 && R.visible(c.x, c.y, 20))
      shadow(
        c.x + 1.5,
        c.y + 1.5,
        (c.def.body.halfLength + 2) * (1 - Math.min(0.4, c.z / 80)) * c.size,
        (c.def.body.halfWidth + 1.9) * c.size,
        c.h,
        0.3,
      );
  for (const b of w.bots) if (b.alive && R.visible(b.x, b.y, 8)) shadow(b.x, b.y, 4, 3, 0, 0.25);
  // an animal's shadow stays on the ground under it: it is how you see a bird is up in the air
  for (const k of w.critters)
    if (R.visible(k.x, k.y, 10)) {
      const r = k.def.radius * (k.state === 'fly' ? 1.5 : 1.15);
      shadow(k.x + 1 + k.z * 0.25, k.y + 1 + k.z * 0.2, r, r * 0.75, k.h, 0.28 / (1 + k.z / 60));
    }
  // what is falling out of the sky is seen coming by its shadow, which tightens as it nears
  for (const p of w.props)
    if (p.alive && p.z > 6 && R.visible(p.x, p.y, 12)) {
      const k = 1 + Math.min(1, p.z / 150);
      shadow(p.x, p.y, p.def.radius * 1.3 * k, p.def.radius * 0.9 * k, p.rot, 0.34 / k);
    }
}
