import type { Chip } from './strips';

/** One loose voxel in the air: a single art pixel with a colour, tumbling. */
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
  /** Seconds it has been flying; it is laid to rest after `MAX_AGE` wherever it is. */
  age: number;
}

const GRAVITY = 420;
const MAX_AGE = 6;
/** Slower than this on the ground, a voxel stops and becomes part of the ground. */
const REST_SPEED = 14;

/**
 * Move a voxel one step: gravity, a bounce that loses most of its speed, friction on the ground.
 * Returns true when it has come to rest (the caller paints it into the ground and drops it).
 */
export function stepVoxel(v: Voxel, dt: number): boolean {
  v.age += dt;
  v.x += v.vx * dt;
  v.y += v.vy * dt;
  v.rot += v.spin * dt;
  v.vz -= GRAVITY * dt;
  v.z += v.vz * dt;
  if (v.z <= 0) {
    v.z = 0;
    v.vz = v.vz < -50 ? -v.vz * 0.32 : 0;
    v.vx *= 0.6;
    v.vy *= 0.6;
    v.spin *= 0.5;
    if (v.vz === 0 && Math.hypot(v.vx, v.vy) < REST_SPEED) return true;
  }
  return v.age > MAX_AGE;
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
    age: 0,
  };
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
