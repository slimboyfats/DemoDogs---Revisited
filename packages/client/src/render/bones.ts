// bones.ts: the parts of a look that move on their own. A bone is a stack standing on a pivot of
// the thing it belongs to (or of another bone): it turns about its upright axis as a stack always
// could, and a bone that turns about a level axis (a mill's sails) flips through poses sampled
// from the same shape at each step of the turn. Only numbers and queueing here; all of it is for
// show, read from the world's clock and the wind, and nothing the sim knows about.

import { restFrames, type Bone } from '@demodogs/shared';
import type { Strip } from './stack';
import { BREEZE, WIND } from './pixel/particles';

/** A look's rig as strips: the bare part in each pose, and each bone in each of its poses. */
export interface RigArt {
  /** How many times its made size it is drawn: the pivots are that much further apart. */
  size: number;
  bare: Strip[];
  bones: { bone: Bone; poses: Strip[] }[];
}

/** What a rig is drawn into: the one call of a `StackSink` it needs. */
export interface BoneSink {
  stack(s: Strip, x: number, y: number, z: number, rot: number, alpha?: number): void;
}

/** A thing a head can turn to. */
export interface Watched {
  x: number;
  y: number;
}

const TAU = Math.PI * 2;
const CALM = Math.hypot(BREEZE[0], BREEZE[1]);
/** The shortest way round from angle a to angle b. */
export function around(a: number, b: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/**
 * How far the wind has turned what it turns, in the turns a calm breeze makes in that many
 * seconds: it runs on faster in a gale. Kept here, moved on by the world's own clock.
 */
let blown = 0;
let clock = -1;
/** Move the wind's turning on to the world's time `t`. Once a frame; twice does no harm. */
export function tickBones(t: number): void {
  const dt = t - clock;
  clock = t;
  if (dt > 0 && dt < 0.5) blown += dt * Math.min(4, Math.hypot(WIND[0], WIND[1]) / CALM);
  else if (dt < 0) blown = t;
}

/** Radians a second a watching bone turns at most, and how fast it closes on what it watches. */
const WATCH_RATE = 5;
const WATCH_EASE = 7;

/** Where each watching or wind-blown bone of one thing is turned to, kept from frame to frame. */
const turned = new WeakMap<object, { t: number; a: Float32Array }>();

/** Which pose a rolling bone shows at `turns` turns. */
export function rollPose(turns: number, fold: number, steps: number): number {
  const f = turns * fold;
  return Math.min(steps - 1, Math.floor((f - Math.floor(f)) * steps));
}

/**
 * Draw a rig standing at (x, y, z) facing `rot`: its bare part in `pose`, and every bone where
 * its motion has it now. `seed` sets each thing's own phase; `key` is the thing itself, for what
 * has to be remembered between frames; `cars` are what a watching bone may turn to (none: it
 * looks straight ahead).
 */
export function queueRig(
  R: BoneSink,
  A: RigArt,
  x: number,
  y: number,
  z: number,
  rot: number,
  alpha: number,
  time: number,
  seed: number,
  key: object,
  cars: readonly Watched[] | null,
  pose = 0,
): void {
  R.stack(A.bare[pose] ?? A.bare[0]!, x, y, z, rot, alpha);
  const n = A.bones.length;
  const k = A.size;
  let mem = turned.get(key);
  if (!mem || mem.a.length !== n) turned.set(key, (mem = { t: time, a: new Float32Array(n) }));
  const dt = Math.min(0.1, Math.max(0, time - mem.t));
  mem.t = time;
  for (let i = 0; i < n; i++) {
    const { bone, poses } = A.bones[i]!;
    const on = bone.on === undefined ? null : frames[bone.on]!;
    const px = on ? on[0] : x;
    const py = on ? on[1] : y;
    const pz = on ? on[2] : z;
    const pa = on ? on[3] : rot;
    const c = Math.cos(pa);
    const s = Math.sin(pa);
    const bx = px + (c * bone.at[0] - s * bone.at[1]) * k;
    const by = py + (s * bone.at[0] + c * bone.at[1]) * k;
    const bz = pz + bone.at[2] * k;
    const rest = pa + (bone.face ?? 0);
    let a = rest;
    let strip = poses[0]!;
    const M = bone.move;
    if (M?.kind === 'turn') a = rest + time * M.rate + seed;
    else if (M?.kind === 'sweep') a = rest + Math.sin(time * M.rate + seed) * M.arc;
    else if (M?.kind === 'wind') {
      const arc = M.arc ?? Math.PI;
      const want = Math.max(-arc, Math.min(arc, around(rest, Math.atan2(WIND[1], WIND[0]))));
      // it swings round to a new wind rather than jumping to it
      mem.a[i] = mem.a[i]! + (want - mem.a[i]!) * Math.min(1, dt * 2.5);
      const gust = Math.hypot(WIND[0], WIND[1]) / CALM;
      a =
        rest +
        mem.a[i]! +
        (M.flutter ?? 0) *
          Math.min(2, gust) *
          (Math.sin(blown * 9 + seed) * 0.7 + Math.sin(blown * 23 + seed * 3) * 0.3);
    } else if (M?.kind === 'watch') {
      let want = 0;
      if (cars) {
        let near = M.reach * M.reach;
        for (const t of cars) {
          const d = (t.x - bx) * (t.x - bx) + (t.y - by) * (t.y - by);
          if (d >= near) continue;
          near = d;
          want = Math.max(-M.arc, Math.min(M.arc, around(rest, Math.atan2(t.y - by, t.x - bx))));
        }
      }
      const d = want - mem.a[i]!;
      const most = WATCH_RATE * dt;
      mem.a[i] = mem.a[i]! + Math.max(-most, Math.min(most, d * Math.min(1, dt * WATCH_EASE)));
      a = rest + mem.a[i]!;
    } else if (M?.kind === 'roll') {
      const turns = (M.by === 'wind' ? blown : time) * M.rate + seed * 0.37;
      strip = poses[rollPose(turns, M.fold ?? 1, poses.length)]!;
    }
    const f = (frames[i] ??= [0, 0, 0, 0]);
    f[0] = bx;
    f[1] = by;
    f[2] = bz;
    f[3] = a;
    R.stack(strip, bx, by, bz, a, alpha);
  }
}

/** Where each bone of the rig being queued stands, for the bones that ride on it. */
const frames: [number, number, number, number][] = [];

/** How far up a rig reaches at rest, art px: its bare part or the top of its highest bone. */
export function rigTall(A: RigArt): number {
  const F = restFrames(A.bones.map((b) => b.bone));
  let top = A.bare[0]!.n / A.bare[0]!.res;
  A.bones.forEach((b, i) => {
    top = Math.max(top, F[i]![2] * A.size + b.poses[0]!.n / b.poses[0]!.res);
  });
  return top;
}
