import { CAR_RADIUS, DT, type WeaponManifest } from '@demodogs/shared';
import type { Car } from './entities';
import { angDiff } from './math';
import { batter, damage, explode, ignite, light, shed } from './damage';
import type { World } from './world';

/**
 * Two arms that reach out by themselves: a coil that throws lightning from car to car, and an orb
 * that sucks everything round it into a knot and then bursts.
 */

/** A car whose coil is crackling: it strikes every `gap` seconds for `t` more seconds. */
export interface Coil {
  car: number;
  t: number;
  next: number;
  def: WeaponManifest;
}

/** A suction orb: drifting out, then anchored and pulling, then it bursts. */
export interface Orb {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Seconds of drift left; once 0 it is anchored. */
  drift: number;
  /** Seconds of pull left. */
  t: number;
  owner: number;
  def: WeaponManifest;
}

/** Seconds between a coil's strikes. */
const GAP = 0.12;

export function startCoil(w: World, c: Car, d: WeaponManifest): void {
  const k = w.arms.coils.find((k) => k.car === c.index);
  if (k) k.t = d.life ?? 0.6;
  else w.arms.coils.push({ car: c.index, t: d.life ?? 0.6, next: 0, def: d });
}

/**
 * One strike: lightning jumps from the car's coil to the nearest rival in front, then on to the
 * next nearest car (or bot, or drum) within reach of that, up to `count` jumps, each weaker. With
 * nothing to strike it earths itself into the ground ahead.
 */
function strike(w: World, c: Car, d: WeaponManifest): void {
  const reach = d.range ?? 120;
  const hops = d.count ?? 4;
  const pts: number[] = [c.x, c.y];
  const hit = new Set<number>([c.index]);
  let x = c.x;
  let y = c.y;
  let amount = d.damage ?? 6;
  for (let h = 0; h < hops; h++) {
    // the first jump looks ahead; the rest go any way
    let best: Car | null = null;
    let bd = h === 0 ? reach : reach * 0.75;
    for (const o of w.cars) {
      if (hit.has(o.index) || o.wrecked || o.z > 12) continue;
      const dd = Math.hypot(o.x - x, o.y - y);
      if (dd >= bd) continue;
      if (h === 0 && Math.abs(angDiff(Math.atan2(o.y - y, o.x - x), c.h)) > 0.9) continue;
      bd = dd;
      best = o;
    }
    if (!best) break;
    hit.add(best.index);
    x = best.x;
    y = best.y;
    pts.push(x, y);
    // a jolt: the engine cuts out for a moment and the car shakes
    best.vx *= 0.86;
    best.vy *= 0.86;
    best.spin += w.rng.range(-1.5, 1.5);
    damage(w, best, amount, c, x, y);
    // the spark sets alight a slick under it, and a drum beside it
    ignite(w, x, y, CAR_RADIUS, c.index);
    for (const p of w.props)
      if (p.alive && p.def.explodesAt !== undefined && Math.hypot(p.x - x, p.y - y) < 14)
        light(p, c.index, 0.2);
    amount *= 0.75;
  }
  if (pts.length === 2) {
    // nothing to strike: the bolt earths into the nearest thing ahead that will take it
    const ex = c.x + Math.cos(c.h) * reach * 0.6 + w.rng.range(-12, 12);
    const ey = c.y + Math.sin(c.h) * reach * 0.6 + w.rng.range(-12, 12);
    let tx = ex;
    let ty = ey;
    let bd = reach * 0.5;
    for (const s of w.near(ex, ey, bd)) {
      if (s.down) continue;
      const dd = Math.hypot(s.x - ex, s.y - ey);
      if (dd < bd) {
        bd = dd;
        tx = s.x;
        ty = s.y;
      }
    }
    pts.push(tx, ty);
    for (const s of w.near(tx, ty, 2)) {
      if (s.down || Math.hypot(s.x - tx, s.y - ty) > s.def.radius + 1) continue;
      if (s.leaves) shed(w, s, 0.08, 'heat', tx, ty);
      batter(w, s, 10, 'heat', tx, ty);
    }
    ignite(w, tx, ty, 5, c.index);
    for (const b of w.bots) {
      if (!b.alive || Math.hypot(b.x - tx, b.y - ty) > 20) continue;
      b.alive = false;
      b.deadT = w.rng.range(b.def.respawn[0], b.def.respawn[1]);
      w.emit({ t: 'smash', bot: b.index, by: c.index, x: b.x, y: b.y, vx: 0, vy: 0 });
      c.score += b.def.points;
      c.smashed++;
    }
  }
  w.emit({ t: 'arc', car: c.index, pts });
}

export function updateCoils(w: World): void {
  const A = w.arms;
  for (let i = A.coils.length - 1; i >= 0; i--) {
    const k = A.coils[i]!;
    const c = w.cars[k.car]!;
    k.t -= DT;
    k.next -= DT;
    if (k.t <= 0 || c.wrecked) {
      A.coils.splice(i, 1);
      continue;
    }
    if (k.next > 0) continue;
    k.next = GAP;
    strike(w, c, k.def);
  }
}

// ---------------------------------------------------------------- the suction orb

export function throwOrb(w: World, c: Car, d: WeaponManifest, at?: [number, number]): void {
  const v = d.speed ?? 150;
  const drift = 0.55;
  const cs = Math.cos(c.h);
  const sn = Math.sin(c.h);
  let vx = c.vx * 0.6 + cs * v;
  let vy = c.vy * 0.6 + sn * v;
  if (at) {
    vx = (at[0] - c.x) / drift;
    vy = (at[1] - c.y) / drift;
  }
  w.arms.orbs.push({
    x: c.x + cs * (c.def.body.halfLength + 4),
    y: c.y + sn * (c.def.body.halfLength + 4),
    vx,
    vy,
    drift,
    t: d.life ?? 3,
    owner: c.index,
    def: d,
  });
  if (w.arms.orbs.length > 4) w.arms.orbs.shift();
}

/** How hard an orb pulls at distance d: strongest near its rim, nothing beyond its radius. */
export function pull(o: Orb, d: number): number {
  const R = o.def.radius ?? 70;
  if (o.drift > 0 || d > R) return 0;
  return (o.def.push ?? 260) * (1 - d / R) * Math.min(1, d / 6);
}

export function updateOrbs(w: World): void {
  const A = w.arms;
  for (let i = A.orbs.length - 1; i >= 0; i--) {
    const o = A.orbs[i]!;
    if (o.drift > 0) {
      o.drift -= DT;
      o.x += o.vx * DT;
      o.y += o.vy * DT;
      [o.x, o.y] = w.keepInside(o.x, o.y, 4);
      if (o.drift <= 0) w.emit({ t: 'orb', x: o.x, y: o.y, r: o.def.radius ?? 70 });
      continue;
    }
    o.t -= DT;
    const R = o.def.radius ?? 70;
    const owner = w.cars[o.owner] ?? null;
    for (const c of w.cars) {
      if (c.wrecked) continue;
      const dx = o.x - c.x;
      const dy = o.y - c.y;
      const d = Math.hypot(dx, dy);
      const f = pull(o, d) * (c.index === o.owner ? 0.4 : 1);
      if (!f) continue;
      // pulled in and swung round: the swirl goes anticlockwise
      c.vx += ((dx / d) * f + (-dy / d) * f * 0.35) * DT * 3;
      c.vy += ((dy / d) * f + (dx / d) * f * 0.35) * DT * 3;
      c.spin += 1.2 * DT;
      // ground down in the knot at the middle
      if (d < 12 && w.tick % 10 === 0)
        damage(w, c, 2, owner && owner !== c ? owner : null, c.x, c.y);
    }
    for (const p of w.props) {
      if (!p.alive || p.flying) continue;
      const dx = o.x - p.x;
      const dy = o.y - p.y;
      const d = Math.hypot(dx, dy);
      const f = pull(o, d);
      if (!f) continue;
      const m = 1 / Math.max(0.5, p.def.mass ?? 1);
      p.vx += ((dx / d) * f - (dy / d) * f * 0.5) * DT * 3.5 * m;
      p.vy += ((dy / d) * f + (dx / d) * f * 0.5) * DT * 3.5 * m;
      p.spin += 6 * DT;
    }
    for (const b of w.bots) {
      if (!b.alive) continue;
      const dx = o.x - b.x;
      const dy = o.y - b.y;
      const d = Math.hypot(dx, dy);
      const f = pull(o, d);
      if (!f) continue;
      b.x += (dx / d) * f * DT * 0.5;
      b.y += (dy / d) * f * DT * 0.5;
      if (d < 8) {
        b.alive = false;
        b.deadT = w.rng.range(b.def.respawn[0], b.def.respawn[1]);
        w.emit({ t: 'smash', bot: b.index, by: o.owner, x: b.x, y: b.y, vx: 0, vy: 0 });
        if (owner) {
          owner.score += b.def.points;
          owner.smashed++;
        }
      }
    }
    // it tears the leaves off trees round it, and wrenches at the scenery inside its heart
    if (w.tick % 6 === 0)
      for (const s of w.near(o.x, o.y, R)) {
        if (s.down) continue;
        const d = Math.hypot(s.x - o.x, s.y - o.y);
        if (d > R) continue;
        if (s.leaves) shed(w, s, 0.05 * (1 - d / R), 'blast', o.x, o.y);
        if (d < R * 0.35)
          batter(w, s, 4, 'blast', s.x + (o.x - s.x) * 0.3, s.y + (o.y - s.y) * 0.3);
      }
    if (o.t > 0) continue;
    A.orbs.splice(i, 1);
    explode(w, o.x, o.y, o.def.power, owner);
  }
}
