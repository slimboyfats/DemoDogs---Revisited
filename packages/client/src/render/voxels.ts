import type { Chip } from './strips';

/** One loose block in the air: a cube with a colour, tumbling. */
export interface Voxel {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rot: number;
  spin: number;
  rgb: number;
  /** How big it is, art px a side. */
  s: number;
  /** Seconds it has been flying; it is laid to rest after `MAX_AGE` wherever it is. */
  age: number;
}

const GRAVITY = 420;
const MAX_AGE = 6;
/** Slower than this on the ground, a voxel stops and becomes part of the ground. */
const REST_SPEED = 14;

/** The smallest a block breaks down to: one texel of a car. */
export const CRUMB = 1 / 6;
/** A block that lands faster than this breaks up. */
const BREAK_SPEED = 80;

/** What a step did to a block: still flying, come to rest, or broken on the ground. */
export type Fate = 'fly' | 'rest' | 'split';

/**
 * Move a block one step: gravity, a bounce that loses most of its speed, friction on the ground.
 * 'rest' means it has stopped (the caller paints it into the ground and drops it); 'split' that it
 * landed hard enough to break (the caller swaps it for its `shards`, if there is room for them).
 */
export function stepVoxel(v: Voxel, dt: number): Fate {
  v.age += dt;
  v.x += v.vx * dt;
  v.y += v.vy * dt;
  v.rot += v.spin * dt;
  v.vz -= GRAVITY * dt;
  v.z += v.vz * dt;
  if (v.z <= 0) {
    const hit = -v.vz;
    v.z = 0;
    v.vz = hit > 50 ? hit * 0.32 : 0;
    v.vx *= 0.6;
    v.vy *= 0.6;
    v.spin *= 0.5;
    if (hit > BREAK_SPEED && v.s > CRUMB * 1.2) return 'split';
    if (v.vz === 0 && Math.hypot(v.vx, v.vy) < REST_SPEED) return 'rest';
  }
  return v.age > MAX_AGE ? 'rest' : 'fly';
}

/**
 * The pieces a block breaks into when it lands: 2, 4 or 8 of half its size (the harder it lands,
 * the more), each a shade off its colour and thrown a little apart. Call it right after a 'split'.
 */
export function shards(v: Voxel, rand: () => number): Voxel[] {
  const up = v.vz;
  const n = up > 80 ? 8 : up > 45 ? 4 : 2;
  const out: Voxel[] = [];
  const kick = 20 + up * 0.5;
  for (let i = 0; i < n; i++) {
    const k = 0.88 + rand() * 0.24;
    const ch = (sh: number) => Math.min(255, Math.round(((v.rgb >> sh) & 255) * k));
    out.push({
      x: v.x + ((i & 1) - 0.5) * v.s * 0.5,
      y: v.y + (((i >> 1) & 1) - 0.5) * v.s * 0.5,
      z: (i >> 2) * v.s * 0.5,
      vx: v.vx + (rand() - 0.5) * kick,
      vy: v.vy + (rand() - 0.5) * kick,
      vz: up * (0.5 + rand() * 0.8),
      rot: v.rot,
      spin: (rand() - 0.5) * 24,
      rgb: (ch(16) << 16) | (ch(8) << 8) | ch(0),
      s: Math.max(CRUMB, v.s / 2),
      age: v.age,
    });
  }
  return out;
}

/** Where a burst comes from and how hard it throws. */
export interface Burst {
  /** The thing's ground position, heading and height of its lowest layer. */
  x: number;
  y: number;
  h: number;
  z: number;
  /** The blast point on the ground the voxels fly away from, and how fast (art px per second). */
  ox: number;
  oy: number;
  speed: number;
  /** Velocity the thing already had. */
  vx: number;
  vy: number;
}

/** Turn a chip knocked off a part into a flying voxel. `rand` gives numbers in 0-1. */
export function launch(c: Chip, b: Burst, rand: () => number): Voxel {
  const cs = Math.cos(b.h);
  const sn = Math.sin(b.h);
  const x = b.x + cs * c.x - sn * c.y;
  const y = b.y + sn * c.x + cs * c.y;
  let dx = x - b.ox;
  let dy = y - b.oy;
  const d = Math.hypot(dx, dy);
  if (d < 0.01) {
    const a = rand() * Math.PI * 2;
    dx = Math.cos(a);
    dy = Math.sin(a);
  } else {
    dx /= d;
    dy /= d;
  }
  const sp = b.speed * (0.35 + rand() * 0.9);
  const spread = b.speed * 0.45;
  return {
    x,
    y,
    z: b.z + c.z,
    vx: b.vx * 0.6 + dx * sp + (rand() - 0.5) * spread,
    vy: b.vy * 0.6 + dy * sp + (rand() - 0.5) * spread,
    vz: b.speed * (0.5 + rand() * 1.1) + c.z * 6,
    rot: b.h,
    spin: (rand() - 0.5) * 24,
    rgb: c.rgb,
    s: c.s,
    age: 0,
  };
}

/** Throw several chips as one piece: they all leave with the same velocity and spin. */
export function launchTogether(chips: Chip[], b: Burst, rand: () => number): Voxel[] {
  const out = chips.map((c) => launch(c, b, rand));
  const lead = out[0];
  if (lead)
    for (const v of out) {
      v.vx = lead.vx;
      v.vy = lead.vy;
      v.vz = lead.vz;
      v.spin = 0;
    }
  return out;
}

/** Pick at most `max` items at random, in place (the rest are dropped). */
export function sample<T>(items: T[], max: number, rand: () => number): T[] {
  for (let i = 0; i < Math.min(max, items.length); i++) {
    const j = i + Math.floor(rand() * (items.length - i));
    const t = items[i]!;
    items[i] = items[j]!;
    items[j] = t;
  }
  if (items.length > max) items.length = max;
  return items;
}

/**
 * A block flying back to where it belongs in something being rebuilt: from (x0, y0, z0) on the
 * ground up an arc to (x1, y1, z1), starting `wait` seconds in and landing at `dur`. `x, y, z`
 * is where it is now.
 */
export interface Homing {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
  x: number;
  y: number;
  z: number;
  rot: number;
  rgb: number;
  s: number;
  t: number;
  wait: number;
  dur: number;
}

/** Seconds a block of something being rebuilt is in the air, at most. */
const FLIGHT = 0.75;

/**
 * Something being rebuilt over `dur` seconds grows back from the bottom up: how much of its height
 * stands `t` seconds in (0 to 1). Its blocks are in the air for the first FLIGHT seconds before the
 * first layer is in place, then the rest go up steadily, each landing as its layer appears.
 */
export function rebuilt(t: number, dur: number): number {
  const fly = Math.min(FLIGHT, dur * 0.4);
  return Math.min(1, Math.max(0, (t - fly) / Math.max(0.01, dur - fly)));
}

/** How far a rebuild runs left to right rather than bottom up (0 to 1). */
export const SWEEP = 0.6;

/** A fallen piece growing back: `t` of `dur` seconds in, sweeping across world x from x0 to x1. */
export interface Rising {
  t: number;
  dur: number;
  x0: number;
  x1: number;
}

/**
 * Where a point `fx` of the way across (left to right) and `fz` of the way up comes in the rebuild,
 * 0 to 1: the front sweeps mostly left to right, tilted so lower parts come a little sooner.
 */
export const front = (fx: number, fz: number): number => SWEEP * fx + (1 - SWEEP) * fz;

/**
 * How far across (world x) a layer `fz` of the way up has grown back, `g` of the way through
 * the rebuild: -Infinity before it starts, Infinity once it is whole.
 */
export function grownTo(r: Rising, g: number, fz: number): number {
  const f = (g - (1 - SWEEP) * fz) / SWEEP;
  if (f <= 0) return -Infinity;
  if (f >= 1) return Infinity;
  return r.x0 + f * (r.x1 - r.x0);
}

/** When (seconds in) the layer a share `f` of the way up lands, and when its blocks take off. */
export function landing(f: number, dur: number): [number, number] {
  const fly = Math.min(FLIGHT, dur * 0.4);
  const at = fly + f * (dur - fly);
  return [at - fly, at];
}

/** Move a homing block on by dt; true once it has arrived. */
export function stepHoming(h: Homing, dt: number): boolean {
  h.t += dt;
  if (h.t >= h.dur - 1e-6) {
    h.x = h.x1;
    h.y = h.y1;
    h.z = h.z1;
    return true;
  }
  const u = Math.min(1, Math.max(0, (h.t - h.wait) / Math.max(0.01, h.dur - h.wait)));
  const e = u * u * (3 - 2 * u);
  const arc = 6 + Math.hypot(h.x1 - h.x0, h.y1 - h.y0) * 0.35;
  h.x = h.x0 + (h.x1 - h.x0) * e;
  h.y = h.y0 + (h.y1 - h.y0) * e;
  h.z = h.z0 + (h.z1 - h.z0) * e + Math.sin(Math.PI * u) * arc;
  h.rot *= 1 - e * 0.2;
  return false;
}
