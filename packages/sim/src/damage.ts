import {
  CAR_RADIUS,
  DT,
  GRAVITY,
  REBUILD_TIME,
  type CarPart,
  type MaterialManifest,
} from '@demodogs/shared';
import { caged, chew, plateOff } from './addons';
import { absorb } from './defence';
import type { Car, LooseProp, StaticProp } from './entities';
import { topple } from './hazards';
import { clamp } from './math';
import { tipOff } from './docks';
import { toLocal } from './physics';
import { tumble } from './rubble';
import { fallOver, settleFloors } from './downtown';
import { stand } from './stand';
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
  const through = absorb(w, c, (amount * w.mode.damageScale) / c.stats.armor, px, py);
  if (through <= 0) return;
  const dealt = plateOff(w, c, through, by, px, py);
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
    chew(w, by, c, dealt, px, py);
  }
  if (c.hp <= 0 && !caged(w, c)) wreck(w, c, by);
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
  explode(w, c.x, c.y, 0.5, null, c.deck);
  // the fuel tank goes too: burning fuel and sparks rain down around the wreck
  scatter(w, c.x, c.y, 5, 3, 2, by ? by.index : -1, c.vx * 0.4, c.vy * 0.4);
  // and the sump: whatever the pack says a wreck leaks
  if (w.leak && c.deck < 1) spill(w, w.leak, c.x, c.y, w.leak.wreck!, by ? by.index : -1);
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
  c.z = c.deck = w.deckAt(i);
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
  pour(w, p);
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
export function explode(
  w: World,
  x: number,
  y: number,
  power: number,
  owner: Car | null,
  z = 0,
): void {
  w.emit(z > 0 ? { t: 'explode', x, y, power, z } : { t: 'explode', x, y, power });
  const rad = 48 * power;
  // up on a deck there is no ground to set alight or dig
  if (z < 4) {
    ignite(w, x, y, rad * 0.7, owner ? owner.index : -1);
    dig(w, x, y, power);
  }
  for (const c of w.cars) {
    const dx = c.x - x;
    const dy = c.y - y;
    const d = Math.hypot(dx, dy);
    if (d > rad) continue;
    // a deck between the blast and the car takes the worst of it
    const k = (1 - d / rad) * (Math.abs(c.deck - z) > 12 ? 0.35 : 1);
    c.vx += (dx / (d || 1)) * 230 * k;
    c.vy += (dy / (d || 1)) * 230 * k;
    c.vz = Math.max(c.vz, 150 * k);
    c.z = Math.max(c.z, c.deck + 0.5);
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
  for (const s of w.near(x, y, rad)) {
    if (s.down || s.hp === undefined) continue;
    const r = s.def.radius;
    if (Math.abs(s.x - x) > rad + r || Math.abs(s.y - y) > rad + r) continue;
    const d = Math.hypot(s.x - x, s.y - y);
    if (d > rad * 0.8 + r) continue;
    const k = 1 - Math.max(0, d - r) / (rad * 0.8);
    // it is struck on the side that faces the blast
    const e = Math.min(1, r / (d || 1));
    batter(w, s, 75 * power * k, 'blast', s.x + (x - s.x) * e, s.y + (y - s.y) * e);
  }
  // the pressure of a blast tears the leaves off trees well beyond its crater, and the heat of
  // one close by sets a crown alight
  const reach = rad * 2.6;
  for (const s of w.near(x, y, reach)) {
    const C = s.def.crown;
    if (!C || s.down || !s.leaves) continue;
    const d = Math.hypot(s.x - x, s.y - y);
    if (d > reach) continue;
    const near = 1 - d / reach;
    shed(w, s, near * (1 - C.hold) * Math.min(1.5, power), 'blast', x, y);
    if (near > 0.5 && w.rng.next() < C.flash * power && !wet(w, s.x, s.y)) {
      const b = {
        x: s.x,
        y: s.y,
        r: s.def.radius + 3,
        t: 4,
        bite: 0.25,
        owner: owner ? owner.index : -1,
      };
      w.blazes.push(b);
      w.emit({ t: 'blaze', x: b.x, y: b.y, r: b.r, life: b.t });
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
      ignite(w, x, y, 6, e.owner);
      for (const s of w.near(x, y, 6))
        if (!s.down && s.hp !== undefined && Math.hypot(s.x - x, s.y - y) < 6 + s.def.radius)
          batter(w, s, 6, 'blast', x, y);
    } else if (wet(w, x, y)) {
      w.emit({ t: 'quench', x, y, r: 5 });
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
    for (const s of w.near(b.x, b.y, b.r))
      if (!s.down && s.hp !== undefined && Math.hypot(s.x - b.x, s.y - b.y) < b.r + s.def.radius)
        batter(w, s, 3, 'heat', s.x, s.y);
    // fire runs on through any pool that touches this one
    ignite(w, b.x, b.y, b.r, b.owner);
  }
  if (w.blazes.length > 40) w.blazes.splice(0, w.blazes.length - 40);
}

/** Is this spot under something that puts fire out? */
function wet(w: World, x: number, y: number): boolean {
  return w.spills.some((s) => s.def.quenches && Math.hypot(s.x - x, s.y - y) < s.r);
}

/** Pour a pool of a material on the ground. Water puts out the fire it lands on. */
export function spill(
  w: World,
  def: MaterialManifest,
  px: number,
  py: number,
  r: number,
  owner: number,
  fixed = false,
): void {
  const [x, y] = w.keepInside(px, py, 2);
  if (fixed) {
    // part of the map: the client paints these when it builds the ground
    w.spills.push({ def, x, y, r, owner, fixed });
    return;
  }
  w.spills.push({ def, x, y, r, owner });
  w.emit({ t: 'spill', material: def.id, x, y, r });
  if (def.quenches)
    for (let i = w.blazes.length - 1; i >= 0; i--) {
      const b = w.blazes[i]!;
      if (Math.hypot(b.x - x, b.y - y) > r + b.r * 0.5) continue;
      w.blazes.splice(i, 1);
      w.emit({ t: 'quench', x: b.x, y: b.y, r: b.r });
    }
  // too many pools: the oldest one that is not part of the map dries up
  if (w.spills.length > 90 && w.spills.reduce((n, s) => n + (s.fixed ? 0 : 1), 0) > 90)
    w.spills.splice(
      w.spills.findIndex((s) => !s.fixed),
      1,
    );
}

/** Fire reaches this far from (x, y): every pool that burns and touches it goes up. */
export function ignite(w: World, x: number, y: number, rad: number, owner: number): void {
  for (let i = w.spills.length - 1; i >= 0; i--) {
    const s = w.spills[i]!;
    if (s.def.burns === undefined || Math.hypot(s.x - x, s.y - y) > rad + s.r) continue;
    w.spills.splice(i, 1);
    if (wet(w, s.x, s.y)) continue;
    w.blazes.push({ x: s.x, y: s.y, r: s.r, t: s.def.burns, bite: 0.25, owner });
    w.emit({ t: 'blaze', x: s.x, y: s.y, r: s.r, life: s.def.burns });
  }
}

/** A prop that holds a liquid pours it out round itself, once. */
export function pour(
  w: World,
  p: Pick<LooseProp, 'def' | 'x' | 'y'> & { leaked?: boolean; owner?: number },
): void {
  const S = p.def.spills;
  if (!S || p.leaked) return;
  p.leaked = true;
  const def = w.content.material.get(S.material)!;
  for (let i = 0; i < S.n; i++) {
    const a = w.rng.range(0, Math.PI * 2);
    const d = i === 0 ? 0 : w.rng.range(0.5, 1.3) * S.r;
    spill(
      w,
      def,
      p.x + Math.cos(a) * d,
      p.y + Math.sin(a) * d,
      S.r * w.rng.range(0.7, 1.1),
      p.owner ?? -1,
    );
  }
}

/** What a car's wheels are in at (x, y): [share of grip kept, drag]. The worst pool wins. */
export function footing(w: World, x: number, y: number): [number, number, boolean] {
  let grip = 1;
  let drag = 0;
  let pit = false;
  for (const c of w.craters) {
    if (Math.abs(c.x - x) > c.r || Math.hypot(c.x - x, c.y - y) > c.r) continue;
    pit = true;
    grip = 0.8;
    drag = 0.9;
  }
  for (const s of w.spills) {
    if (Math.hypot(s.x - x, s.y - y) > s.r) continue;
    grip = Math.min(grip, s.def.grip);
    drag = Math.max(drag, s.def.drag);
  }
  return [grip, drag, pit];
}

/** An exploding prop throws out what its manifest says: stars, burning fuel, blazing drums. */
export function throwOut(
  w: World,
  p: Pick<LooseProp, 'def' | 'x' | 'y'> & { owner?: number },
): void {
  const owner = p.owner ?? -1;
  const T = p.def.throws;
  if (!T) return;
  scatter(w, p.x, p.y, 6, T.stars, T.globs, owner);
  const drum = T.drum ? w.content.prop.get(T.drum) : undefined;
  if (!drum?.rocket) return;
  for (let i = 0; i < T.drums; i++) {
    const a = w.rng.range(0, Math.PI * 2);
    const v = w.rng.range(40, 110);
    w.props.push({
      index: w.props.length,
      def: drum,
      x: p.x,
      y: p.y,
      z: 4,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      vz: drum.rocket.up * w.rng.range(0.7, 1.1),
      rot: 0,
      spin: w.rng.range(-9, 9),
      alive: true,
      fuse: 0,
      owner,
      flying: true,
    });
  }
}

/**
 * Scenery takes a knock at (x, y). What it is made of decides how much of it counts; when it has
 * taken all it can it comes down. Returns true if this knock brought it down.
 */
export function batter(
  w: World,
  s: StaticProp,
  amount: number,
  by: 'blast' | 'impact' | 'heat',
  x: number,
  y: number,
): boolean {
  if (s.down || s.hp === undefined) return false;
  const d = amount / (s.made?.strength[by] ?? 1);
  if (d <= 0) return false;
  // fire eats the crown, and a ram shakes leaves out of it
  if (by === 'heat') shed(w, s, 0.25, 'heat', x, y);
  else if (by === 'impact') shed(w, s, Math.min(0.3, 0.06 + d / 150), 'shake', x, y);
  s.hp -= d;
  if (s.hp > 0) {
    w.emit({ t: 'chip', prop: s.index, x, y, amount: d, by });
    settleFloors(w, s, x, y);
    return false;
  }
  fall(w, s, x, y);
  return true;
}

/** A piece of scenery comes down. A building that has lost half its walls follows it. */
export function fall(w: World, s: StaticProp, x: number, y: number): void {
  if (s.down) return;
  s.down = true;
  s.hp = 0;
  if (s.def.fallOver)
    fallOver(w, s, x, y, (d, px, py, r) => stand(w, d, px, py, r, w.rng.range(0, 10)));
  w.emit({ t: 'fall', prop: s.index, x, y });
  pour(w, s);
  tumble(w, s);
  if (s.def.topple) topple(w, s, x, y);
  if (s.def.topples) tipOff(w, s, x, y);
  if (s.def.rebuild !== undefined) {
    s.mendT = s.def.rebuild;
    w.mending.push(s);
  }
  if (s.lift !== undefined && s.lift > 6) drop(w, s);
  if (s.def.blast) {
    explode(w, s.x, s.y, s.def.blast, null);
    throwOut(w, s);
  }
  if (s.group === undefined || !s.bears) return;
  let walls = 0;
  let gone = 0;
  for (const o of w.statics)
    if (o.group === s.group && o.bears) {
      walls++;
      if (o.down) gone++;
    }
  if (gone * 2 < walls) return;
  for (const o of w.statics) if (o.group === s.group && !o.down) fall(w, o, o.x, o.y);
}

/**
 * Fallen props that are built again: the last REBUILD_TIME of the wait they fly back together
 * (a 'mend' event for the client to show), then stand, whole. A solid one waits while a car is
 * where it would stand.
 */
export function updateMending(w: World): void {
  for (let i = w.mending.length - 1; i >= 0; i--) {
    const s = w.mending[i]!;
    s.mendT = Math.max(0, s.mendT! - DT);
    if (!s.mending && s.mendT <= REBUILD_TIME) {
      s.mending = true;
      w.emit({ t: 'mend', prop: s.index, in: s.mendT });
    }
    if (s.mendT > 0) continue;
    const r = s.def.radius + CAR_RADIUS + 4;
    if (s.def.solid && w.cars.some((c) => Math.abs(c.x - s.x) < r && Math.abs(c.y - s.y) < r))
      continue;
    w.mending.splice(i, 1);
    s.down = false;
    s.mending = false;
    delete s.mendT;
    if (s.def.integrity !== undefined) s.hp = s.def.integrity;
    if (s.def.crown) s.leaves = 1;
    w.emit({ t: 'stand', prop: s.index });
  }
}

/** Something up high comes down: it lands on the cars below it. */
function drop(w: World, s: StaticProp): void {
  const r = s.def.radius;
  const cs = Math.cos(s.rot);
  const sn = Math.sin(s.rot);
  // a deck piece is as wide as the road across its length; a crown of leaves is round and light
  const leafy = s.def.crown !== undefined;
  const across = leafy || s.def.solid ? r : Math.max(r, w.road / 2 + 3);
  for (const c of w.cars) {
    if (c.wrecked || c.z > s.lift! - 6) continue;
    const dx = c.x - s.x;
    const dy = c.y - s.y;
    const along = dx * cs + dy * sn;
    const side = -dx * sn + dy * cs;
    if (Math.abs(along) > r + 6 || Math.abs(side) > across + 4) continue;
    damage(w, c, leafy ? 6 : 22, null, c.x, c.y);
    if (!leafy) c.vz = Math.max(c.vz, 40);
    w.emit({ t: 'crash', x: c.x, y: c.y, impact: 90, player: c === w.player });
  }
}

/**
 * A blast digs a pit where it goes off: wider in open ground than in a road. One that lands in
 * a pit that is already there widens it instead.
 */
export function dig(w: World, x: number, y: number, power: number): void {
  if (power < 0.45) return;
  const soft = w.grid === null || w.offroad(x, y);
  const r = (soft ? 8 : 5) * Math.sqrt(power);
  for (const c of w.craters) {
    if (Math.hypot(c.x - x, c.y - y) > c.r * 0.6) continue;
    c.r = Math.min(24, Math.sqrt(c.r * c.r + r * r * 0.6));
    w.emit({ t: 'crater', x: c.x, y: c.y, r: c.r });
    return;
  }
  w.craters.push({ x, y, r });
  if (w.craters.length > 160) w.craters.shift();
  w.emit({ t: 'crater', x, y, r });
}

/** A tree loses up to `amount` of a full crown of leaves. */
export function shed(
  w: World,
  s: StaticProp,
  amount: number,
  by: 'blast' | 'heat' | 'shake',
  x: number,
  y: number,
): void {
  if (!s.leaves) return;
  const a = Math.min(s.leaves, amount);
  if (a < 0.02) return;
  s.leaves = s.leaves - a < 0.02 ? 0 : s.leaves - a;
  w.emit({ t: 'strip', prop: s.index, x, y, amount: a, left: s.leaves, by });
}
