import { CAR_RADIUS, DT, type Controls, type WeaponManifest } from '@demodogs/shared';
import type { Car } from './entities';
import { damage, spill } from './damage';
import { circles } from './physics';
import type { World } from './world';

/**
 * Things a car drops behind it for whoever is chasing: a smoke cloud that blinds, and spikes that
 * give a flat. (A glue or oil patch is a slick: a pool of a material, see `spill`.)
 */

/** A smoke cloud on the ground. It swells to `r` over its first second and thins out at the end. */
export interface Cloud {
  x: number;
  y: number;
  r: number;
  /** Seconds it has hung, and seconds it hangs in all. */
  t: number;
  life: number;
  /** Seconds a driver who goes in cannot see after coming out. */
  blind: number;
  owner: number;
}

/** A spike lying on the ground. */
export interface Spike {
  x: number;
  y: number;
  /** Seconds it has lain, and seconds it lies before it is kicked off the road. */
  t: number;
  life: number;
  owner: number;
  def: WeaponManifest;
}

/** Does this weapon go out the back (so a driver lets it go on a car behind)? */
export function dropsBehind(kind: WeaponManifest['kind'] | undefined): boolean {
  return kind === 'mine' || kind === 'slick' || kind === 'smoke' || kind === 'caltrops';
}

/** How far the cloud reaches now. */
export function cloudReach(c: Cloud): number {
  return c.r * Math.min(1, 0.45 + c.t * 0.8) * (c.t > c.life - 1 ? Math.max(0, c.life - c.t) : 1);
}

/** Is (x, y) inside a smoke cloud? */
export function inSmoke(w: World, x: number, y: number): boolean {
  for (const c of w.clouds) {
    const r = cloudReach(c);
    if (Math.abs(c.x - x) < r && Math.hypot(c.x - x, c.y - y) < r) return true;
  }
  return false;
}

/** Let a smoke cloud or caltrops go at (x, y), as `owner` heading h dropped them. */
export function drop(
  w: World,
  def: WeaponManifest,
  owner: number,
  x: number,
  y: number,
  h: number,
) {
  const [px, py] = w.keepInside(x, y, 2);
  if (def.kind === 'smoke') {
    w.clouds.push({
      x: px,
      y: py,
      r: def.radius ?? 26,
      t: 0,
      life: def.life ?? 6,
      blind: def.blind ?? 1,
      owner,
    });
    if (w.clouds.length > 8) w.clouds.shift();
  } else if (def.kind === 'caltrops') {
    // a spray across the road behind: wider than it is long
    const n = def.count ?? 9;
    const r = def.radius ?? 14;
    const cs = Math.cos(h);
    const sn = Math.sin(h);
    for (let i = 0; i < n; i++) {
      const across = w.rng.range(-1, 1) * r;
      const along = w.rng.range(-0.45, 0.45) * r;
      const [sx, sy] = w.keepInside(
        px + cs * along - sn * across,
        py + sn * along + cs * across,
        1,
      );
      w.spikes.push({ x: sx, y: sy, t: 0, life: def.life ?? 25, owner, def });
    }
    if (w.spikes.length > 60) w.spikes.splice(0, w.spikes.length - 60);
  }
}

/**
 * A blinded AI driver: it cannot see the road, so it holds on roughly where it was going, its
 * hands wandering, off the power a little, and fires nothing.
 */
export function blinded(w: World, c: Car, ctl: Controls): Controls {
  if (!c.ai || c.wrecked) return ctl;
  for (const k of w.clouds) {
    const r = cloudReach(k);
    if (Math.hypot(k.x - c.x, k.y - c.y) < r) c.blind = Math.max(c.blind ?? 0, k.blind);
  }
  if (!c.blind || c.blind <= 0) return ctl;
  c.blind = Math.max(0, c.blind - DT);
  const wander = Math.sin(w.time * 1.9 + c.index * 2.3) * 0.7 + Math.sin(w.time * 4.3) * 0.25;
  return {
    steer: Math.max(-1, Math.min(1, ctl.steer * 0.15 + wander)),
    throttle: Math.min(ctl.throttle, 0.7),
    brake: false,
    boost: false,
    fire: false,
  };
}

/** One tick: clouds hang and go, spikes bite tyres, flats slow and shake their cars. */
export function updateDrops(w: World): void {
  for (let i = w.clouds.length - 1; i >= 0; i--) {
    const c = w.clouds[i]!;
    c.t += DT;
    if (c.t >= c.life) w.clouds.splice(i, 1);
  }
  for (let i = w.spikes.length - 1; i >= 0; i--) {
    const s = w.spikes[i]!;
    s.t += DT;
    if (s.t >= s.life) {
      w.spikes.splice(i, 1);
      continue;
    }
    // the one who threw them gets a moment to clear out
    const victim = w.cars.find((c) => {
      if (c.wrecked || c.z > 4 || (c.index === s.owner && s.t < 1.5)) return false;
      if (Math.abs(c.x - s.x) > 16 || Math.abs(c.y - s.y) > 16) return false;
      return circles(c).some(([x, y]) => Math.hypot(x - s.x, y - s.y) < CAR_RADIUS);
    });
    if (!victim) continue;
    w.spikes.splice(i, 1);
    const fresh = !victim.flat || victim.flat <= 0;
    victim.flat = Math.max(victim.flat ?? 0, s.def.flat ?? 4);
    if (fresh) {
      w.emit({ t: 'puncture', car: victim.index, x: s.x, y: s.y });
      damage(w, victim, s.def.damage ?? 3, w.cars[s.owner] ?? null, s.x, s.y);
    }
  }
  for (const c of w.cars) {
    if (!c.flat || c.flat <= 0) continue;
    c.flat = Math.max(0, c.flat - DT);
    if (c.wrecked || c.z > 0.6) continue;
    // a flat drags and pulls the car about, the harder the faster it goes
    const v = Math.hypot(c.vx, c.vy);
    const f = Math.exp(-0.9 * DT);
    c.vx *= f;
    c.vy *= f;
    c.spin += w.rng.range(-1, 1) * Math.min(1, v / 120) * 9 * DT;
    c.bounce = Math.max(c.bounce, w.rng.next() < 0.25 ? w.rng.range(0.2, 0.7) : 0);
  }
}

/** Test range: drop a rear weapon at (x, y) as `owner` facing h would (slicks pour a pool). */
export function rangeDrop(
  w: World,
  def: WeaponManifest,
  owner: Car,
  x: number,
  y: number,
  h = owner.h,
): void {
  if (def.kind === 'slick') {
    const m = def.material ? w.content.material.get(def.material) : undefined;
    if (m) spill(w, m, x, y, def.radius ?? 12, owner.index);
  } else drop(w, def, owner.index, x, y, h);
  w.emit({ t: 'fire', car: owner.index, weapon: def.id });
}
