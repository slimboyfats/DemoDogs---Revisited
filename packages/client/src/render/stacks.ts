import type { Bot, Car, StaticProp, World } from '@demodogs/sim';
import type { Art } from './art';
import type { Effects } from './effects';
import { pose } from './rig';
import { tall, type Strip } from './stack';
import { grownTo, rebuilt, type Rising } from './voxels';

const MINE_OFF = { minelit: 'black' };

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
    /** Draw only what lies west of this world x (a rebuild sweeping in); the canvas draws it all. */
    wipe?: number,
  ): void;
  stack(s: Strip, x: number, y: number, z: number, rot: number, alpha?: number): void;
  limb(s: Strip, a: readonly number[], b: readonly number[], n: number): void;
}

/** A static prop that never moves or sways: the canvas renderer draws it as one baked image. */
export type StaticHook = (s: StaticProp, strip: Strip) => boolean;

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
  for (const s of w.statics) if (!s.down) queueStatic(R, art, w, fx, s, P, still);
  // fallen scenery growing back, layer by layer as its blocks land
  for (const [s, r] of fx.rising) if (s.down) queueRising(R, art, s, r);
  for (const p of w.props)
    if (p.alive && R.visible(p.x, p.y, 8, 10)) {
      R.group(p.y);
      R.stack(art.prop(p.def.id), p.x, p.y, p.z, p.rot);
    }
  const t = w.time;
  for (const p of w.pickups)
    if (p.on && R.visible(p.x, p.y, 8, 12 + p.z)) {
      R.group(p.y);
      R.stack(art.pickup, p.x, p.y, p.z + 2.5 + Math.sin(t * 3 + p.x) * 1.5, t * 1.8 + p.y);
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
  for (const r of w.rockets) {
    R.group(r.y);
    R.stack(art.prop(r.def.id), r.x, r.y, r.z + 4, r.h);
  }
  for (const b of w.bots) queueBot(R, art, fx, b);
  for (const d of fx.debris)
    if (R.visible(d.x, d.y, 8, 10)) {
      R.group(d.y);
      R.stack(d.strip, d.x, d.y, d.z, d.rot, d.life < 1.5 ? d.life / 1.5 : 1);
    }
  for (const c of w.cars) queueCar(R, art, w, fx, c);
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
  const strip = fx.scarred.get(s) ?? art.prop(s.def.id);
  const lift = s.lift ?? 0;
  if (!R.visible(s.x, s.y, s.def.radius + 12, tall(strip) + lift)) return;
  R.group(s.y);
  if (lift !== 0) {
    // stood up off the ground: a deck piece or a crown up in a tree. Slices that would be under
    // the ground (the foot of a ramp) are left out.
    const alpha = over(s, strip, lift, P) ? 0.4 : 1;
    const from = Math.max(0, Math.ceil(-lift * strip.res));
    const wind = s.def.sway ? sway(w.time, s.seed) : 0;
    for (let i = from; i < strip.n; i++) {
      const o = wind * (0.5 + (0.5 * i) / strip.n) * 1.6;
      R.slice(strip, i, s.x + o, s.y + o * 0.4, lift + i / strip.res, s.rot, 1, alpha);
    }
    return;
  }
  if (!s.def.sway) {
    if (!still?.(s, strip)) R.stack(strip, s.x, s.y, 0, s.rot);
    return;
  }
  // trees sway: the higher the slice, the further it moves
  const wind = sway(w.time, s.seed);
  for (let i = 0; i < strip.n; i++) {
    const k = i / strip.n;
    const o = wind * k * k * 1.8;
    R.slice(strip, i, s.x + o, s.y + o * 0.4, i / strip.res, s.rot);
  }
}

/** The bottom share `f` of a fallen piece's layers, where it stands. */
function queueRising(R: StackSink, art: Art, s: StaticProp, r: Rising): void {
  const strip = art.prop(s.def.id);
  const lift = s.lift ?? 0;
  if (!R.visible(s.x, s.y, s.def.radius + 12, tall(strip) + lift)) return;
  const g = rebuilt(r.t, r.dur);
  R.group(s.y);
  const from = Math.max(0, Math.ceil(-lift * strip.res));
  for (let i = from; i < strip.n; i++) {
    // each layer is grown back as far across as the sweep has reached it
    const x = grownTo(r, g, i / strip.n);
    if (x === -Infinity) break;
    R.slice(strip, i, s.x, s.y, lift + i / strip.res, s.rot, 1, 1, x === Infinity ? undefined : x);
  }
}

/** How far the wind has a tree over, for its phase `seed`. */
function sway(t: number, seed: number): number {
  return Math.sin(t * 1.3 + seed) * 0.9 + Math.sin(t * 2.9 + seed * 2) * 0.3;
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
  if (!R.visible(c.x, c.y, 20, 14)) return;
  R.group(c.y);
  const A = fx.carArt(c);
  const body = fx.bodies[c.index]!;
  const D = c.def;
  const cs = Math.cos(c.h);
  const sn = Math.sin(c.h);
  const alpha = c.invuln > 0 && Math.floor(w.time * 12) % 2 ? 0.4 : 1;
  const wheel = art.wheels[((Math.floor(c.wheelDist / 2.2) % 3) + 3) % 3]!;
  const z = c.z;
  for (const wh of D.wheels)
    for (const sg of [-1, 1]) {
      const wx = wh[0];
      const wy = wh[1] * sg;
      const steer = wx > 0 && !c.wrecked ? c.steer * 0.45 : 0;
      R.stack(wheel, c.x + cs * wx - sn * wy, c.y + sn * wx + cs * wy, z, c.h + steer, alpha);
    }
  // the body: each slice shifted a little more than the one below, so it leans and squats
  const rx = -sn;
  const ry = cs;
  for (let i = 0; i < body.n; i++) {
    const t = i / (body.n - 1);
    const o = c.roll * t;
    const l = c.lurch * t;
    R.slice(
      body,
      i,
      c.x + rx * o + cs * l,
      c.y + ry * o + sn * l,
      z + 0.6 + i / body.res + c.bounce,
      c.h,
      1,
      alpha,
    );
  }
  const a = D.body.halfLength - 0.1;
  const o = c.roll;
  const l = c.lurch;
  const bz = z + 1.4 + c.bounce;
  if (c.has.front)
    R.stack(A.bumper, c.x + cs * a + rx * o * 0.15, c.y + sn * a + ry * o * 0.15, bz, c.h, alpha);
  if (c.has.rear)
    R.stack(A.bumper, c.x - cs * a + rx * o * 0.15, c.y - sn * a + ry * o * 0.15, bz, c.h, alpha);
  if (c.has.top)
    R.stack(
      A.top,
      c.x + cs * (D.top.x + l) + rx * o,
      c.y + sn * (D.top.x + l) + ry * o,
      z + 0.6 + D.top.z + c.bounce,
      c.h,
      alpha,
    );
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
    if (c.deck < 4 && R.visible(c.x, c.y, 20))
      shadow(
        c.x + 1.5,
        c.y + 1.5,
        (c.def.body.halfLength + 2) * (1 - Math.min(0.4, c.z / 80)),
        c.def.body.halfWidth + 1.9,
        c.h,
        0.3,
      );
  for (const b of w.bots) if (b.alive && R.visible(b.x, b.y, 8)) shadow(b.x, b.y, 4, 3, 0, 0.25);
}
