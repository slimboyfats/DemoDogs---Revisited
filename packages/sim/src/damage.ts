import { DT, GRAVITY, type CarPart } from '@demodogs/shared';
import type { Car, LooseProp } from './entities';
import { clamp } from './math';
import { toLocal } from './physics';
import type { World } from './world';

/** Damage a car at (px, py), credited to `by`. Scaled by the mode and the car's armour. */
export function damage(
  w: World,
  c: Car,
  amount: number,
  by: Car | null,
  px: number,
  py: number,
): void {
  if (c.wrecked || c.invuln > 0 || amount <= 0.5 || w.phase !== 'race') return;
  const dealt = (amount * w.mode.damageScale) / c.stats.armor;
  c.hp -= dealt;
  const L = toLocal(c, px, py);
  const lx = clamp(L[0], -12, 12);
  const ly = clamp(L[1], -6, 6);
  w.emit({ t: 'hit', car: c.index, by: by ? by.index : -1, x: px, y: py, lx, ly, amount: dealt });
  if (c.hp < 74 || (dealt > 14 && lx < -7)) detach(w, c, 'rear');
  if (c.hp < 52 || (dealt > 18 && lx > 7)) detach(w, c, 'front');
  if (c.hp < 34) detach(w, c, 'top');
  if (by && by !== c && !by.wrecked) {
    const pts = Math.round(dealt * 3);
    by.score += pts;
    if (dealt > 9)
      w.emit({ t: 'score', car: by.index, x: c.x, y: c.y, points: pts, label: `+${pts}` });
  }
  if (c.hp <= 0) wreck(w, c, by);
}

export function detach(w: World, c: Car, part: CarPart): void {
  if (!c.has[part]) return;
  c.has[part] = false;
  const off =
    part === 'front'
      ? c.def.body.halfLength + 0.5
      : part === 'rear'
        ? -c.def.body.halfLength - 0.5
        : c.def.top.x;
  w.emit({
    t: 'detach',
    car: c.index,
    part,
    x: c.x + Math.cos(c.h) * off,
    y: c.y + Math.sin(c.h) * off,
    z: c.z + (part === 'top' ? c.def.top.z : 1),
    vx: c.vx * 0.5 + w.rng.range(-50, 50),
    vy: c.vy * 0.5 + w.rng.range(-50, 50),
  });
}

export function wreck(w: World, c: Car, by: Car | null): void {
  c.wrecked = true;
  c.wreckT = 0;
  c.wreckTick = w.tick;
  c.hp = 0;
  detach(w, c, 'front');
  detach(w, c, 'rear');
  detach(w, c, 'top');
  c.vz = 140;
  c.z = Math.max(c.z, 0.5);
  c.spin += w.rng.range(-8, 8);
  c.weapon = null;
  c.ammo = 0;
  w.emit({ t: 'wreck', car: c.index, by: by ? by.index : -1 });
  explode(w, c.x, c.y, 0.5, null);
  // the fuel tank goes too: burning fuel and sparks rain down around the wreck
  scatter(w, c.x, c.y, 5, 3, 2, by ? by.index : -1, c.vx * 0.4, c.vy * 0.4);
  if (by && by !== c) {
    by.wrecks++;
    by.score += 500;
    w.emit({
      t: 'score',
      car: by.index,
      x: c.x,
      y: c.y,
      points: 500,
      label: `WRECKED ${c.name}! +500`,
    });
  }
}

/** Tow a wrecked car back to the road a little behind where it died. */
export function respawn(w: World, c: Car): void {
  const T = w.track;
  if (!T) return;
  const i = (c.idx - 2 + T.n) % T.n;
  c.has = { front: true, rear: true, top: true };
  c.hp = 100;
  c.wrecked = false;
  w.placeOnTrack(c, i, 0);
  c.vx = c.vy = c.vz = c.z = c.spin = 0;
  c.invuln = 2.2;
  c.nitro = Math.max(c.nitro, 0.5);
  for (
    let tries = 0;
    tries < 6 && w.cars.some((o) => o !== c && Math.hypot(o.x - c.x, o.y - c.y) < 18);
    tries++
  ) {
    c.x -= Math.sin(c.h) * 14;
    c.y += Math.cos(c.h) * 14;
  }
  w.emit({ t: 'respawn', car: c.index });
}

/** Light a prop's fuse (barrels). */
export function light(p: LooseProp, owner: number, fuse: number): void {
  if (p.fuse > 0 || !p.alive || p.flying) return;
  p.fuse = fuse;
  p.owner = owner;
}

export function breakProp(w: World, p: LooseProp, by: Car | null): void {
  p.alive = false;
  w.emit({ t: 'break', prop: p.index, x: p.x, y: p.y, vx: p.vx, vy: p.vy });
  if (by && p.def.points) {
    by.score += p.def.points;
    w.emit({
      t: 'score',
      car: by.index,
      x: p.x,
      y: p.y,
      points: p.def.points,
      label: `+${p.def.points}`,
    });
  }
}

/** A blast at (x, y): hurts and throws cars, flattens bots, lights barrels, smashes crates. */
export function explode(w: World, x: number, y: number, power: number, owner: Car | null): void {
  w.emit({ t: 'explode', x, y, power });
  const rad = 48 * power;
  for (const c of w.cars) {
    const dx = c.x - x;
    const dy = c.y - y;
    const d = Math.hypot(dx, dy);
    if (d > rad) continue;
    const k = 1 - d / rad;
    c.vx += (dx / (d || 1)) * 230 * k;
    c.vy += (dy / (d || 1)) * 230 * k;
    c.vz = Math.max(c.vz, 150 * k);
    c.z = Math.max(c.z, 0.5);
    c.spin += w.rng.range(-6, 6) * k;
    damage(w, c, 36 * k * power, owner && owner !== c ? owner : null, x, y);
  }
  for (const b of w.bots) {
    if (!b.alive || Math.hypot(b.x - x, b.y - y) >= rad) continue;
    b.alive = false;
    b.deadT = w.rng.range(b.def.respawn[0], b.def.respawn[1]);
    w.emit({
      t: 'smash',
      bot: b.index,
      by: owner ? owner.index : -1,
      x: b.x,
      y: b.y,
      vx: w.rng.range(-80, 80),
      vy: w.rng.range(-80, 80),
    });
    if (owner) {
      owner.score += b.def.points;
      owner.smashed++;
    }
  }
  for (const p of w.props) {
    if (!p.alive) continue;
    const dx = p.x - x;
    const dy = p.y - y;
    const d = Math.hypot(dx, dy);
    if (d > rad * 1.2 || d < 0.01) continue;
    const k = 1 - d / (rad * 1.2);
    if (p.def.explodesAt !== undefined)
      light(p, owner ? owner.index : -1, 0.12 + w.rng.next() * 0.12);
    else if (p.def.breaksAt !== undefined && k > 0.4) {
      breakProp(w, p, null);
      continue;
    }
    p.vx += (dx / d) * 260 * k;
    p.vy += (dy / d) * 260 * k;
    p.vz = Math.max(p.vz, (170 * k * GRAVITY) / 400);
    p.spin += w.rng.range(-10, 10);
  }
}

/** Throw burning stars and globs of fuel out from a point in the air. */
export function scatter(
  w: World,
  x: number,
  y: number,
  z: number,
  stars: number,
  globs: number,
  owner: number,
  vx = 0,
  vy = 0,
): void {
  for (let i = 0; i < stars + globs; i++) {
    const star = i < stars;
    const a = w.rng.range(0, Math.PI * 2);
    const v = star ? w.rng.range(35, 95) : w.rng.range(20, 60);
    w.embers.push({
      kind: star ? 'star' : 'glob',
      x,
      y,
      z,
      vx: vx + Math.cos(a) * v,
      vy: vy + Math.sin(a) * v,
      vz: w.rng.range(40, star ? 130 : 90),
      owner,
    });
  }
}

/** A fuel drum that has been broken open: a fireball where it stood, and the drum shoots up. */
export function launch(w: World, p: LooseProp): void {
  const R = p.def.rocket!;
  const owner = p.owner >= 0 ? w.cars[p.owner]! : null;
  p.flying = true;
  p.fuse = 0;
  explode(w, p.x, p.y, (p.def.blast ?? 1) * 0.6, owner);
  p.z = Math.max(p.z, 1);
  p.vz = R.up;
  p.vx = w.rng.range(-35, 35);
  p.vy = w.rng.range(-35, 35);
  p.spin = w.rng.range(-9, 9);
  w.emit({ t: 'launch', prop: p.index, x: p.x, y: p.y });
}

/** The flying drum blows apart: stars and burning fuel rain down, and it hurts what is near. */
export function airburst(w: World, p: LooseProp): void {
  const R = p.def.rocket!;
  p.alive = false;
  p.flying = false;
  w.emit({ t: 'airburst', x: p.x, y: p.y, z: p.z, power: R.burst });
  // high up it only rains fire; low down (it hit something on the way) it is a blast as well
  if (p.z < 25) explode(w, p.x, p.y, R.burst, p.owner >= 0 ? w.cars[p.owner]! : null);
  scatter(w, p.x, p.y, p.z, R.stars, R.globs, p.owner, p.vx, p.vy);
}

/** Burning bits in the air fall; a star pops where it lands, a glob becomes a pool of fire. */
export function updateEmbers(w: World): void {
  for (let i = w.embers.length - 1; i >= 0; i--) {
    const e = w.embers[i]!;
    const star = e.kind === 'star';
    // stars drift down slowly, as a firework's do
    e.vz -= GRAVITY * (star ? 0.4 : 0.9) * DT;
    e.x += e.vx * DT;
    e.y += e.vy * DT;
    e.z += e.vz * DT;
    if (star) {
      e.vx *= 1 - 1.2 * DT;
      e.vy *= 1 - 1.2 * DT;
    }
    if (e.z > 0) continue;
    w.embers.splice(i, 1);
    const [x, y] = w.keepInside(e.x, e.y, 2);
    const owner = e.owner >= 0 ? w.cars[e.owner]! : null;
    if (star) {
      w.emit({ t: 'pop', x, y });
      for (const c of w.cars)
        if (Math.hypot(c.x - x, c.y - y) < 10)
          damage(w, c, 5, owner && owner !== c ? owner : null, x, y);
      for (const p of w.props)
        if (p.def.explodesAt !== undefined && Math.hypot(p.x - x, p.y - y) < 8)
          light(p, e.owner, 0.15 + w.rng.next() * 0.2);
    } else {
      const life = w.rng.range(3.5, 5.5);
      w.blazes.push({ x, y, r: 9, t: life, bite: 0.2, owner: e.owner });
      w.emit({ t: 'blaze', x, y, r: 9, life });
    }
  }
  for (let i = w.blazes.length - 1; i >= 0; i--) {
    const b = w.blazes[i]!;
    b.t -= DT;
    if (b.t <= 0) {
      w.blazes.splice(i, 1);
      continue;
    }
    b.bite -= DT;
    if (b.bite > 0) continue;
    b.bite = 0.3;
    const owner = b.owner >= 0 ? w.cars[b.owner]! : null;
    for (const c of w.cars)
      if (c.z < 4 && Math.hypot(c.x - b.x, c.y - b.y) < b.r + 4)
        damage(w, c, 2.2, owner && owner !== c ? owner : null, c.x, c.y);
    for (const p of w.props)
      if (p.def.explodesAt !== undefined && Math.hypot(p.x - b.x, p.y - b.y) < b.r + p.def.radius)
        light(p, b.owner, 0.3 + w.rng.next() * 0.5);
  }
  if (w.blazes.length > 40) w.blazes.splice(0, w.blazes.length - 40);
}
