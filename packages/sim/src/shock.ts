import { DT, type Controls, type WeaponManifest } from '@demodogs/shared';
import type { Car, Spill, StaticProp } from './entities';
import { damage, ignite, light } from './damage';
import type { World } from './world';

/**
 * Shock pulses: a ring of charge that spreads out from the car that fired it and rides along with
 * it. Every rival the ring crosses has its engine cut for a moment (it coasts, cannot boost or
 * fire) and takes a small jolt. Scenery made of something that conducts (a pylon, a steel husk)
 * takes the charge and throws it on: a bolt jumps from it to every car near it, to fuel lying
 * near it (which goes up) and to drums and kegs (whose fuses it lights), then on to the next
 * conductor in reach, hop after hop. A pool that conducts (water) shocks every car standing in
 * it, and a pool that burns catches from the ring itself.
 *
 * Nothing here names a content id: what conducts and what burns come from the materials.
 */
export interface Pulse {
  x: number;
  y: number;
  /** How far it has spread, and how far it goes. */
  r: number;
  max: number;
  owner: number;
  def: WeaponManifest;
  /** Cars it has already struck (the owner from the start), by index. */
  struck: number[];
  /** Scenery it has already arced through, by index. */
  zapped: number[];
  /** Pools it has already reached. */
  pools: Spill[];
}

/** Height a bolt leaves a conductor from, and strikes a car at. */
const MAST = 12;
const ROOF = 5;
/** How hard a cut engine drags the car down, per second, on top of rolling. */
const DEAD_DRAG = 0.8;

export function firePulse(w: World, c: Car, def: WeaponManifest): void {
  const max = def.radius ?? 70;
  w.pulses.push({
    x: c.x,
    y: c.y,
    r: 0,
    max,
    owner: c.index,
    def,
    struck: [c.index],
    zapped: [],
    pools: [],
  });
  w.emit({ t: 'pulse', car: c.index, x: c.x, y: c.y, r: max, life: max / (def.speed ?? 260) });
}

/** What a car with a cut engine can still do: steer and brake. */
export function stallControls(c: Car, ctl: Controls): Controls {
  if (!c.stall) return ctl;
  return { ...ctl, throttle: 0, boost: false, fire: false };
}

/** One tick: dead engines drag and count down, and every ring spreads and strikes. */
export function updatePulses(w: World): void {
  for (const c of w.cars) {
    if (!c.stall) continue;
    c.stall = Math.max(0, c.stall - DT);
    if (c.z <= 0.6) {
      const f = Math.exp(-DEAD_DRAG * DT);
      c.vx *= f;
      c.vy *= f;
    }
  }
  for (let i = w.pulses.length - 1; i >= 0; i--) {
    const p = w.pulses[i]!;
    const owner = w.cars[p.owner];
    if (owner && !owner.wrecked) {
      p.x = owner.x;
      p.y = owner.y;
    }
    p.r = Math.min(p.max, p.r + (p.def.speed ?? 260) * DT);
    spread(w, p);
    if (p.r >= p.max) w.pulses.splice(i, 1);
  }
}

/** The point on the ring's edge facing (x, y). */
function edge(p: Pulse, x: number, y: number): [number, number] {
  const d = Math.hypot(x - p.x, y - p.y) || 1;
  const k = Math.min(1, p.r / d);
  return [p.x + (x - p.x) * k, p.y + (y - p.y) * k];
}

function spread(w: World, p: Pulse): void {
  for (const c of w.cars) {
    if (c.wrecked || c.z > 10 || p.struck.includes(c.index)) continue;
    if (Math.hypot(c.x - p.x, c.y - p.y) > p.r + c.def.body.halfWidth) continue;
    const [ex, ey] = edge(p, c.x, c.y);
    strike(w, p, c, ex, ey, 2);
  }
  for (const s of w.near(p.x, p.y, p.r)) {
    if (s.down || !s.made?.conducts || p.zapped.includes(s.index)) continue;
    if (Math.hypot(s.x - p.x, s.y - p.y) > p.r + s.def.radius) continue;
    const [ex, ey] = edge(p, s.x, s.y);
    discharge(w, p, s, ex, ey, 2, p.def.chain ?? 2);
  }
  // pools: burning ones catch, conducting ones shock whoever stands in them
  for (const s of [...w.spills]) {
    if (p.pools.includes(s) || Math.hypot(s.x - p.x, s.y - p.y) > p.r + s.r) continue;
    const [ex, ey] = edge(p, s.x, s.y);
    pool(w, p, s, ex, ey, 1);
  }
}

/** The charge reaches a pool from (fx, fy, fz). */
function pool(w: World, p: Pulse, s: Spill, fx: number, fy: number, fz: number): void {
  if (s.def.burns === undefined && !s.def.conducts) return;
  p.pools.push(s);
  w.emit({ t: 'arc', x: fx, y: fy, z: fz, tx: s.x, ty: s.y, tz: 0 });
  if (s.def.burns !== undefined) ignite(w, s.x, s.y, 0, p.owner);
  if (!s.def.conducts) return;
  // it runs on through every pool of the same that touches this one
  for (const q of [...w.spills])
    if (q.def === s.def && !p.pools.includes(q) && Math.hypot(q.x - s.x, q.y - s.y) < q.r + s.r)
      pool(w, p, q, s.x, s.y, 0);
  for (const c of w.cars)
    if (
      !c.wrecked &&
      c.z <= 2 &&
      !p.struck.includes(c.index) &&
      Math.hypot(c.x - s.x, c.y - s.y) < s.r + c.def.body.halfWidth
    )
      strike(w, p, c, s.x, s.y, 0);
}

/**
 * A conductor takes the charge from (fx, fy, fz) and throws it on to everything in reach, then
 * to the nearest conductor it has not been through, while there are hops left.
 */
function discharge(
  w: World,
  p: Pulse,
  s: StaticProp,
  fx: number,
  fy: number,
  fz: number,
  hops: number,
): void {
  p.zapped.push(s.index);
  w.emit({ t: 'arc', x: fx, y: fy, z: fz, tx: s.x, ty: s.y, tz: MAST });
  const reach = p.def.reach ?? 60;
  for (const c of w.cars) {
    if (c.wrecked || c.z > 14 || p.struck.includes(c.index)) continue;
    if (Math.hypot(c.x - s.x, c.y - s.y) > reach) continue;
    strike(w, p, c, s.x, s.y, MAST);
  }
  for (const q of [...w.spills]) {
    if (p.pools.includes(q) || Math.hypot(q.x - s.x, q.y - s.y) > reach + q.r) continue;
    pool(w, p, q, s.x, s.y, MAST);
  }
  for (const d of w.props) {
    if (!d.alive || d.fuse > 0 || d.flying) continue;
    if (d.def.explodesAt === undefined && !d.def.rocket) continue;
    if (Math.hypot(d.x - s.x, d.y - s.y) > reach) continue;
    w.emit({ t: 'arc', x: s.x, y: s.y, z: MAST, tx: d.x, ty: d.y, tz: d.z + 4 });
    light(d, p.owner, 0.2 + w.rng.next() * 0.25);
  }
  if (hops <= 0) return;
  let next: StaticProp | null = null;
  let best = reach;
  for (const o of w.near(s.x, s.y, reach)) {
    if (o.down || !o.made?.conducts || p.zapped.includes(o.index)) continue;
    const d = Math.hypot(o.x - s.x, o.y - s.y) - o.def.radius;
    if (d < best) {
      best = d;
      next = o;
    }
  }
  if (next) discharge(w, p, next, s.x, s.y, MAST, hops - 1);
}

/** A bolt from (fx, fy, fz) strikes a car: its engine dies and it takes a jolt. */
function strike(w: World, p: Pulse, c: Car, fx: number, fy: number, fz: number): void {
  p.struck.push(c.index);
  w.emit({ t: 'arc', x: fx, y: fy, z: fz, tx: c.x, ty: c.y, tz: c.z + ROOF });
  if (c.invuln > 0) return;
  const time = p.def.stall ?? 1.1;
  c.stall = Math.max(c.stall ?? 0, time);
  c.spin += w.rng.range(-1.2, 1.2);
  w.emit({ t: 'stall', car: c.index, by: p.owner, time });
  const by = w.cars[p.owner] ?? null;
  damage(w, c, p.def.damage ?? 6, by && by !== c ? by : null, c.x, c.y);
}
