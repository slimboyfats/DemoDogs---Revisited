import { CAR_RADIUS, DT, GRAVITY, type WeaponManifest } from '@demodogs/shared';
import type { Bot, Car, StaticProp } from './entities';
import { angDiff, clamp } from './math';
import { batter, breakProp, damage, explode, ignite, light, shed } from './damage';
import { inSmoke } from './drops';
import type { World } from './world';
import { fireWild, isWild, updateWild, wildWants } from './wild';

/**
 * Ten more arms, each a weapon `kind` of its own; every number comes from the weapon's manifest.
 *
 * - `boomerang`: a bent stick thrown out ahead that comes round and back to the car that threw it,
 *   cutting what it crosses both ways. Catch it and the round is yours again.
 * - `skip`: a rubber bomb that skips down the road, a blast at every bounce.
 * - `tether`: a hook on a line. It bites the first car it meets and the two are hauled together.
 * - `barrage`: a row of shells called down out of the sky, each marked before it lands.
 * - `burrow`: a digger that runs under the ground, under walls and all, and comes up under a car.
 * - `sentry`: a turret set down on the road that shoots at every rival in reach.
 * - `swarm`: a boxful of fleas that hop to the nearest rivals, cling on and bite.
 * - `beam`: a cutting ray held on whatever is ahead: it burns cars and eats through scenery.
 * - `swap`: a bolt that changes places with the car it strikes.
 * - `trail`: the car's wheels leave a wall of fire behind them.
 */

/** A thrown stick: on its way out, then coming home. */
export interface Stick {
  x: number;
  y: number;
  /** The level it flies on (a deck's height, or 0). */
  z: number;
  h: number;
  v: number;
  /** How far it has flown out, and whether it has turned for home. */
  gone: number;
  back: boolean;
  t: number;
  owner: number;
  def: WeaponManifest;
  /** Seconds before it can cut each car again, by car index. */
  cd: number[];
}

/** A skipping bomb in the air between bounces. */
export interface Toy {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  level: number;
  /** Bounces it still has in it, and seconds since it was thrown. */
  n: number;
  age: number;
  owner: number;
  def: WeaponManifest;
}

/** A hook in flight, its line paying out behind it. */
export interface Hook {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  /** Line still on the reel. */
  left: number;
  owner: number;
  def: WeaponManifest;
}

/** Two cars on one line: `a` threw it, `b` is hooked. */
export interface Tether {
  a: number;
  b: number;
  t: number;
  def: WeaponManifest;
}

/** A shell on its way down to (x, y), landing in `t` seconds. */
export interface Strike {
  x: number;
  y: number;
  t: number;
  /** The warning it was given, for the client to place it in the sky. */
  from: number;
  owner: number;
  def: WeaponManifest;
}

/** A digger under the ground. */
export interface Mole {
  x: number;
  y: number;
  h: number;
  t: number;
  age: number;
  owner: number;
  def: WeaponManifest;
}

/** A turret standing on the road. */
export interface Sentry {
  x: number;
  y: number;
  h: number;
  t: number;
  age: number;
  rounds: number;
  cd: number;
  owner: number;
  def: WeaponManifest;
}

/** A flea: hopping over the ground, or clinging to a car. */
export interface Flea {
  x: number;
  y: number;
  /** The car it rides, or -1; where on that car, in the car's frame. */
  host: number;
  lx: number;
  ly: number;
  /** The car it is after, or -1. */
  target: number;
  t: number;
  owner: number;
  def: WeaponManifest;
}

/** A car holding a cutting ray on what is ahead: from (x, y) to where it stops, (tx, ty). */
export interface Beam {
  car: number;
  t: number;
  def: WeaponManifest;
  x: number;
  y: number;
  tx: number;
  ty: number;
  /** The car it is on (or -1), and the burn it is owed. */
  on: number;
  owed: number;
}

/** A bolt that changes places with what it strikes. */
export interface Bolt {
  x: number;
  y: number;
  z: number;
  h: number;
  left: number;
  owner: number;
  def: WeaponManifest;
}

/** A car laying fire behind it; (lx, ly) is where it last set some down. */
export interface Trail {
  car: number;
  t: number;
  lx: number;
  ly: number;
  def: WeaponManifest;
}

export interface Arsenal {
  sticks: Stick[];
  toys: Toy[];
  hooks: Hook[];
  tethers: Tether[];
  strikes: Strike[];
  moles: Mole[];
  sentries: Sentry[];
  fleas: Flea[];
  beams: Beam[];
  bolts: Bolt[];
  trails: Trail[];
}

export function newArsenal(): Arsenal {
  return {
    sticks: [],
    toys: [],
    hooks: [],
    tethers: [],
    strikes: [],
    moles: [],
    sentries: [],
    fleas: [],
    beams: [],
    bolts: [],
    trails: [],
  };
}

const KINDS = new Set<WeaponManifest['kind']>([
  'boomerang',
  'skip',
  'tether',
  'barrage',
  'burrow',
  'sentry',
  'swarm',
  'beam',
  'swap',
  'trail',
]);

/** Is this one of the kinds this module fires? */
export function isArsenal(kind: WeaponManifest['kind'] | undefined): boolean {
  return kind !== undefined && (KINDS.has(kind) || isWild(kind));
}

/** Things this far apart in height are on different levels and pass each other by. */
const LEVELS = 12;
/** What pulls a skipping bomb and a falling shell down. */
const G = GRAVITY * 0.6;

/** Is running car c where something low on level z could touch it? */
function within(c: Car, z: number): boolean {
  return !c.wrecked && Math.abs(c.deck - z) < LEVELS && c.z - c.deck < 10;
}

/** The nearest running rival of car `me` within `d` of (x, y) on level z, inside `cone` of h. */
export function prey(
  w: World,
  me: number,
  x: number,
  y: number,
  z: number,
  d: number,
  h = 0,
  cone = Math.PI,
): Car | null {
  let best: Car | null = null;
  let bd = d;
  for (const o of w.cars) {
    if (o.index === me || !within(o, z)) continue;
    const dd = Math.hypot(o.x - x, o.y - y);
    if (dd >= bd) continue;
    if (cone < Math.PI && Math.abs(angDiff(Math.atan2(o.y - y, o.x - x), h)) > cone) continue;
    bd = dd;
    best = o;
  }
  return best;
}

/** Is static s in the way at (x, y)? */
function blocks(s: StaticProp, x: number, y: number, pad: number): boolean {
  if (s.down || !s.def.solid) return false;
  const r = s.def.radius + pad;
  return Math.abs(s.x - x) < r && Math.abs(s.y - y) < r && Math.hypot(s.x - x, s.y - y) < r;
}

/** The solid piece of scenery in the way at (x, y), if any. Only the ground has scenery on it. */
export function wall(w: World, x: number, y: number, z: number, pad: number): StaticProp | null {
  if (z > 4) return null;
  for (const s of w.near(x, y, pad + 1)) if (blocks(s, x, y, pad)) return s;
  return null;
}

export function squash(w: World, b: Bot, by: Car | null, vx: number, vy: number): void {
  b.alive = false;
  b.deadT = w.rng.range(b.def.respawn[0], b.def.respawn[1]);
  w.emit({ t: 'smash', bot: b.index, by: by ? by.index : -1, x: b.x, y: b.y, vx, vy });
  if (by) {
    by.score += b.def.points;
    by.smashed++;
  }
}

/** For AI drivers: is now a good moment to use the weapon held? */
export function arsenalWants(w: World, c: Car): boolean {
  const d = c.weapon;
  if (!d || !isArsenal(d.kind) || c.fireCd > 0) return false;
  if (isWild(d.kind)) return wildWants(w, c);
  const ahead = (dist: number, cone: number) => prey(w, c.index, c.x, c.y, c.deck, dist, c.h, cone);
  const R = d.range ?? 160;
  switch (d.kind) {
    case 'boomerang':
      return ahead(R * 0.9, 0.3) !== null;
    case 'skip':
      return ahead(210, 0.25) !== null;
    case 'tether':
      return ahead(R * 0.9, 0.15) !== null;
    case 'barrage':
      return ahead(R, 0.5) !== null;
    case 'burrow':
      return ahead(R, 0.6) !== null;
    case 'swarm':
      return prey(w, c.index, c.x, c.y, c.deck, R * 0.6) !== null;
    case 'beam':
      return ahead(R * 0.8, 0.12) !== null;
    case 'swap': {
      // only worth it for the place of a car that is further on
      const o = ahead(R * 0.9, 0.3);
      return o !== null && w.kind === 'race' && o.progress > c.progress;
    }
    default: {
      // a turret, a trail of fire: for whoever is close behind
      const o = prey(w, c.index, c.x, c.y, c.deck, 90);
      return o !== null && Math.abs(angDiff(Math.atan2(o.y - c.y, o.x - c.x), c.h)) > 1.6;
    }
  }
}

/** Fire one of these from car c. The caller has spent the round and set the cooldown. */
export function fireArsenal(w: World, c: Car, d: WeaponManifest, at?: [number, number]): void {
  if (isWild(d.kind)) return fireWild(w, c, d, at);
  const cs = Math.cos(c.h);
  const sn = Math.sin(c.h);
  const nose = c.def.body.halfLength + 3;
  const x = c.x + cs * nose;
  const y = c.y + sn * nose;
  const K = w.arsenal;
  const fwd = Math.max(0, c.vf);
  switch (d.kind) {
    case 'boomerang':
      K.sticks.push({
        x,
        y,
        z: c.deck,
        h: c.h,
        v: (d.speed ?? 300) + fwd,
        gone: 0,
        back: false,
        t: d.life ?? 4,
        owner: c.index,
        def: d,
        cd: [],
      });
      if (K.sticks.length > 8) K.sticks.shift();
      break;
    case 'skip': {
      const v = (d.speed ?? 230) + fwd;
      K.toys.push({
        x,
        y,
        z: 4,
        vx: cs * v,
        vy: sn * v,
        vz: (G * (d.fuse ?? 0.45)) / 2,
        level: c.deck,
        n: d.count ?? 4,
        age: 0,
        owner: c.index,
        def: d,
      });
      if (K.toys.length > 8) K.toys.shift();
      break;
    }
    case 'tether': {
      const v = (d.speed ?? 420) + fwd;
      K.hooks.push({
        x,
        y,
        z: c.deck,
        vx: cs * v,
        vy: sn * v,
        left: d.range ?? 170,
        owner: c.index,
        def: d,
      });
      break;
    }
    case 'barrage':
      barrage(w, c, d, at);
      break;
    case 'burrow':
      K.moles.push({ x, y, h: c.h, t: d.life ?? 4, age: 0, owner: c.index, def: d });
      if (K.moles.length > 8) K.moles.shift();
      break;
    case 'sentry': {
      const [sx, sy] = at ?? w.keepInside(c.x - cs * (nose + 6), c.y - sn * (nose + 6), 4);
      K.sentries.push({
        x: sx,
        y: sy,
        h: c.h + Math.PI,
        t: d.life ?? 14,
        age: 0,
        rounds: d.count ?? 40,
        cd: 0.6,
        owner: c.index,
        def: d,
      });
      w.emit({ t: 'sentry', what: 'up', x: sx, y: sy });
      if (K.sentries.length > 5) {
        const old = K.sentries.shift()!;
        w.emit({ t: 'sentry', what: 'spent', x: old.x, y: old.y });
      }
      break;
    }
    case 'swarm': {
      const n = d.count ?? 7;
      for (let i = 0; i < n; i++) {
        const a = c.h + w.rng.range(-1.2, 1.2);
        const r = w.rng.range(2, 9);
        K.fleas.push({
          x: x + Math.cos(a) * r,
          y: y + Math.sin(a) * r,
          host: -1,
          lx: 0,
          ly: 0,
          target: -1,
          t: d.fuse ?? 4,
          owner: c.index,
          def: d,
        });
      }
      if (K.fleas.length > 48) K.fleas.splice(0, K.fleas.length - 48);
      break;
    }
    case 'beam': {
      const b = K.beams.find((b) => b.car === c.index);
      if (b) b.t = d.life ?? 1.6;
      else {
        K.beams.push({
          car: c.index,
          t: d.life ?? 1.6,
          def: d,
          x,
          y,
          tx: x,
          ty: y,
          on: -1,
          owed: 0,
        });
        w.emit({ t: 'beam', car: c.index, on: true });
      }
      break;
    }
    case 'swap':
      K.bolts.push({ x, y, z: c.deck, h: c.h, left: d.range ?? 300, owner: c.index, def: d });
      break;
    default: {
      const t = K.trails.find((t) => t.car === c.index);
      if (t) t.t = d.life ?? 3.5;
      else K.trails.push({ car: c.index, t: d.life ?? 3.5, lx: c.x, ly: c.y, def: d });
    }
  }
}

// ---------------------------------------------------------------- the stick

function updateSticks(w: World): void {
  const K = w.arsenal;
  for (let i = K.sticks.length - 1; i >= 0; i--) {
    const s = K.sticks[i]!;
    const d = s.def;
    const r = d.radius ?? 4;
    const o = w.cars[s.owner]!;
    s.t -= DT;
    if (!s.back) {
      s.gone += s.v * DT;
      if (s.gone >= (d.range ?? 150)) s.back = true;
    } else if (!o.wrecked) {
      // it comes round for the hand that threw it, tighter the nearer it gets
      const dist = Math.hypot(o.x - s.x, o.y - s.y);
      const turn = (d.homing ?? 6) * DT * (1 + 60 / (dist + 1));
      s.h += clamp(angDiff(Math.atan2(o.y - s.y, o.x - s.x), s.h), -turn, turn);
      s.v = Math.max(s.v, Math.hypot(o.vx, o.vy) + 150);
      if (dist < CAR_RADIUS + r + 3) {
        // caught: the round goes back in the rack
        K.sticks.splice(i, 1);
        if (o.weapon === d) o.ammo++;
        else if (!o.weapon) {
          o.weapon = d;
          o.ammo = 1;
        }
        w.emit({ t: 'catch', car: o.index, x: s.x, y: s.y });
        continue;
      }
    }
    const cs = Math.cos(s.h);
    const sn = Math.sin(s.h);
    s.x += cs * s.v * DT;
    s.y += sn * s.v * DT;
    let gone = s.t <= 0;
    const k = w.keepInside(s.x, s.y, r);
    if (k[0] !== s.x || k[1] !== s.y) gone = true;
    for (const c of w.cars) {
      if (c === o || !within(c, s.z)) continue;
      if ((s.cd[c.index] ?? 0) > 0) {
        s.cd[c.index]! -= DT;
        continue;
      }
      if (Math.hypot(c.x - s.x, c.y - s.y) > CAR_RADIUS + r) continue;
      s.cd[c.index] = 0.5;
      c.vx += cs * 50;
      c.vy += sn * 50;
      c.spin += w.rng.range(-3, 3);
      damage(w, c, d.damage ?? 16, o, s.x, s.y);
      w.emit({ t: 'crash', x: s.x, y: s.y, impact: 120, player: false });
    }
    for (const b of w.bots)
      if (b.alive && Math.hypot(b.x - s.x, b.y - s.y) < r + 4) squash(w, b, o, cs * 120, sn * 120);
    for (const p of w.props) {
      if (!p.alive || p.flying || Math.hypot(p.x - s.x, p.y - s.y) > p.def.radius + r) continue;
      if (p.def.breaksAt !== undefined) breakProp(w, p, o);
      else if (p.def.explodesAt !== undefined) light(p, s.owner, 0.2);
    }
    const st = gone ? null : wall(w, s.x, s.y, s.z, r * 0.5);
    if (st) {
      // through what it can cut down; anything stouter and it clatters to the ground
      if (st.leaves) shed(w, st, 0.2, 'shake', s.x, s.y);
      const fell = st.hp !== undefined && batter(w, st, 45, 'impact', s.x, s.y);
      if (!fell) {
        w.emit({ t: 'crash', x: s.x, y: s.y, impact: 90, player: false });
        gone = true;
      }
    }
    if (gone) {
      K.sticks.splice(i, 1);
      w.emit({ t: 'fizz', x: s.x, y: s.y });
    }
  }
}

// ---------------------------------------------------------------- the skipping bomb

function updateToys(w: World): void {
  const K = w.arsenal;
  for (let i = K.toys.length - 1; i >= 0; i--) {
    const t = K.toys[i]!;
    const d = t.def;
    t.age += DT;
    t.vz -= G * DT;
    t.x += t.vx * DT;
    t.y += t.vy * DT;
    t.z += t.vz * DT;
    const k = w.keepInside(t.x, t.y, 3);
    if (k[0] !== t.x || k[1] !== t.y) {
      // off the edge of the world: back it comes
      [t.x, t.y] = k;
      t.vx *= -0.6;
      t.vy *= -0.6;
    }
    let down = t.z <= 0;
    if (!down && t.z < 8)
      down = w.cars.some(
        (c) =>
          within(c, t.level) &&
          (c.index !== t.owner || t.age > 0.5) &&
          Math.hypot(c.x - t.x, c.y - t.y) < CAR_RADIUS + 3,
      );
    const st = !down && t.z < 10 ? wall(w, t.x, t.y, t.level, 2) : null;
    if (st) {
      // it comes off a wall the way a ball does
      const dx = t.x - st.x;
      const dy = t.y - st.y;
      const dl = Math.hypot(dx, dy) || 1;
      const into = -(t.vx * dx + t.vy * dy) / dl;
      if (into > 0) {
        t.vx += (1.6 * into * dx) / dl;
        t.vy += (1.6 * into * dy) / dl;
      }
    }
    if (!down) continue;
    explode(w, t.x, t.y, d.power, w.cars[t.owner] ?? null, t.level);
    if (--t.n <= 0) {
      K.toys.splice(i, 1);
      continue;
    }
    t.z = 0.01;
    t.vz = (G * (d.fuse ?? 0.45)) / 2;
    t.vx *= 0.85;
    t.vy *= 0.85;
  }
}

// ---------------------------------------------------------------- the hook and line

function updateHooks(w: World): void {
  const K = w.arsenal;
  for (let i = K.hooks.length - 1; i >= 0; i--) {
    const h = K.hooks[i]!;
    const d = h.def;
    const a = w.cars[h.owner]!;
    const v = Math.hypot(h.vx, h.vy);
    h.x += h.vx * DT;
    h.y += h.vy * DT;
    h.left -= v * DT;
    const b = w.cars.find(
      (c) => c !== a && within(c, h.z) && Math.hypot(c.x - h.x, c.y - h.y) < CAR_RADIUS + 2,
    );
    if (b) {
      K.hooks.splice(i, 1);
      const old = K.tethers.findIndex((t) => t.a === a.index);
      if (old >= 0) K.tethers.splice(old, 1);
      K.tethers.push({ a: a.index, b: b.index, t: d.life ?? 3.5, def: d });
      damage(w, b, d.damage ?? 6, a, h.x, h.y);
      w.emit({ t: 'leash', from: a.index, to: b.index, x: h.x, y: h.y });
      continue;
    }
    const k = w.keepInside(h.x, h.y, 1);
    const st = wall(w, h.x, h.y, h.z, 1);
    if (st) {
      // it bites into the scenery and the line jerks tight: a flimsy thing comes away
      if (st.hp !== undefined) batter(w, st, 90, 'impact', h.x, h.y);
      w.emit({ t: 'crash', x: h.x, y: h.y, impact: 80, player: false });
    }
    if (st || h.left <= 0 || a.wrecked || k[0] !== h.x || k[1] !== h.y) {
      K.hooks.splice(i, 1);
      w.emit({ t: 'fizz', x: h.x, y: h.y });
    }
  }
  for (let i = K.tethers.length - 1; i >= 0; i--) {
    const t = K.tethers[i]!;
    const d = t.def;
    const a = w.cars[t.a]!;
    const b = w.cars[t.b]!;
    t.t -= DT;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy) || 1;
    if (
      t.t <= 0 ||
      a.wrecked ||
      b.wrecked ||
      dist > (d.range ?? 170) * 1.8 ||
      Math.abs(a.deck - b.deck) > LEVELS
    ) {
      K.tethers.splice(i, 1);
      w.emit({ t: 'snap', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      continue;
    }
    const slack = d.reach ?? 34;
    if (dist <= slack) continue;
    // the line is tight: the hooked car is hauled back, and the one that threw it hauled on
    const f = Math.min(460, (d.push ?? 9) * (dist - slack)) * DT;
    a.vx += (dx / dist) * f * 0.8;
    a.vy += (dy / dist) * f * 0.8;
    b.vx -= (dx / dist) * f * 1.2;
    b.vy -= (dy / dist) * f * 1.2;
  }
}

// ---------------------------------------------------------------- the barrage

/**
 * Mark a row of `count` shells along the car's heading, the middle one on the car ahead (where it
 * will be when that shell lands), on `at`, or two thirds of `range` out.
 */
function barrage(w: World, c: Car, d: WeaponManifest, at?: [number, number]): void {
  const n = d.count ?? 6;
  const R = d.range ?? 230;
  const gap = d.fuse ?? 0.22;
  const warn = d.arm ?? 0.9;
  const mid = warn + ((n - 1) / 2) * gap;
  const t = prey(w, c.index, c.x, c.y, c.deck, R, c.h, 0.5);
  let mx: number;
  let my: number;
  if (at) [mx, my] = at;
  else if (t) {
    mx = t.x + t.vx * mid * 0.8;
    my = t.y + t.vy * mid * 0.8;
  } else {
    mx = c.x + Math.cos(c.h) * R * 0.66;
    my = c.y + Math.sin(c.h) * R * 0.66;
  }
  const h = Math.atan2(my - c.y, mx - c.x);
  const step = Math.min(26, (R * 0.7) / n);
  for (let i = 0; i < n; i++) {
    const along = (i - (n - 1) / 2) * step;
    const off = w.rng.range(-1, 1) * (d.spread ?? 12);
    const [x, y] = w.keepInside(
      mx + Math.cos(h) * along - Math.sin(h) * off,
      my + Math.sin(h) * along + Math.cos(h) * off,
      4,
    );
    const land = warn + i * gap;
    w.arsenal.strikes.push({ x, y, t: land, from: land, owner: c.index, def: d });
    w.emit({ t: 'incoming', x, y, in: land });
  }
}

function updateStrikes(w: World): void {
  const K = w.arsenal;
  for (let i = K.strikes.length - 1; i >= 0; i--) {
    const s = K.strikes[i]!;
    s.t -= DT;
    if (s.t > 0) continue;
    K.strikes.splice(i, 1);
    explode(w, s.x, s.y, s.def.power, w.cars[s.owner] ?? null);
  }
}

// ---------------------------------------------------------------- the digger

function updateMoles(w: World): void {
  const K = w.arsenal;
  for (let i = K.moles.length - 1; i >= 0; i--) {
    const m = K.moles[i]!;
    const d = m.def;
    m.t -= DT;
    m.age += DT;
    // it noses after the nearest car on the ground ahead of it
    const t = prey(w, m.owner, m.x, m.y, 0, d.range ?? 220, m.h, 1.2);
    if (t) {
      const turn = (d.homing ?? 2.2) * DT;
      m.h += clamp(angDiff(Math.atan2(t.y - m.y, t.x - m.x), m.h), -turn, turn);
    }
    m.x += Math.cos(m.h) * (d.speed ?? 200) * DT;
    m.y += Math.sin(m.h) * (d.speed ?? 200) * DT;
    const k = w.keepInside(m.x, m.y, 3);
    let up = m.t <= 0 || k[0] !== m.x || k[1] !== m.y;
    [m.x, m.y] = k;
    const trig = d.trigger ?? 11;
    if (!up && m.age >= (d.arm ?? 0.35))
      up = w.cars.some(
        (c) =>
          c.index !== m.owner &&
          !c.wrecked &&
          c.deck < 4 &&
          c.z < 6 &&
          Math.hypot(c.x - m.x, c.y - m.y) < trig,
      );
    if (!up) continue;
    K.moles.splice(i, 1);
    // up it comes: whatever is on top of it is thrown into the air on the blast
    for (const c of w.cars) {
      if (c.wrecked || c.deck > 4 || Math.hypot(c.x - m.x, c.y - m.y) > trig * 1.6) continue;
      c.vz = Math.max(c.vz, d.lift ?? 190);
      c.z = Math.max(c.z, 0.6);
    }
    explode(w, m.x, m.y, d.power, w.cars[m.owner] ?? null);
  }
}

// ---------------------------------------------------------------- the turret

function updateSentries(w: World): void {
  const K = w.arsenal;
  for (let i = K.sentries.length - 1; i >= 0; i--) {
    const s = K.sentries[i]!;
    const d = s.def;
    const o = w.cars[s.owner]!;
    s.t -= DT;
    s.age += DT;
    s.cd -= DT;
    // run down: any car that drives over it flattens it, and it goes off under them
    const over = w.cars.find(
      (c) =>
        within(c, 0) &&
        c.z < 4 &&
        (c !== o || s.age > 1.2) &&
        Math.hypot(c.x - s.x, c.y - s.y) < CAR_RADIUS + 3,
    );
    if (over) {
      K.sentries.splice(i, 1);
      w.emit({ t: 'sentry', what: 'crushed', x: s.x, y: s.y });
      explode(w, s.x, s.y, d.power, o);
      continue;
    }
    if (s.t <= 0 || s.rounds <= 0) {
      K.sentries.splice(i, 1);
      w.emit({ t: 'sentry', what: 'spent', x: s.x, y: s.y });
      continue;
    }
    let best: Car | null = null;
    let bd = d.range ?? 120;
    for (const c of w.cars) {
      if (c === o || !within(c, 0) || c.invuln > 0 || inSmoke(w, c.x, c.y)) continue;
      const dd = Math.hypot(c.x - s.x, c.y - s.y);
      if (dd < bd) {
        bd = dd;
        best = c;
      }
    }
    if (!best) {
      // nothing in reach: it sweeps, looking
      s.h += 0.9 * DT;
      continue;
    }
    const want = Math.atan2(best.y - s.y, best.x - s.x);
    const turn = (d.homing ?? 4) * DT;
    s.h += clamp(angDiff(want, s.h), -turn, turn);
    if (s.cd > 0 || Math.abs(angDiff(want, s.h)) > 0.14) continue;
    s.cd = d.fuse ?? 0.22;
    s.rounds--;
    const hit = w.rng.next() < 0.85;
    const x = s.x + Math.cos(s.h) * 5;
    const y = s.y + Math.sin(s.h) * 5;
    const tx = hit ? best.x + w.rng.range(-3, 3) : x + Math.cos(s.h) * (bd + 30);
    const ty = hit ? best.y + w.rng.range(-3, 3) : y + Math.sin(s.h) * (bd + 30);
    w.emit({ t: 'shot', car: s.owner, x, y, tx, ty, hit: hit ? best.index : -1 });
    if (hit) damage(w, best, d.damage ?? 5, o, tx, ty);
  }
}

// ---------------------------------------------------------------- the fleas

function updateFleas(w: World): void {
  const K = w.arsenal;
  /** Fleas on each car, counted for the bite they take together. */
  const riding: number[] = [];
  const by: number[] = [];
  for (let i = K.fleas.length - 1; i >= 0; i--) {
    const f = K.fleas[i]!;
    const d = f.def;
    f.t -= DT;
    let gone = f.t <= 0;
    if (f.host >= 0) {
      const c = w.cars[f.host]!;
      // a car that leaves the ground shakes them off, and a wreck is no meal
      if (c.wrecked || c.z - c.deck > 5) gone = true;
      else {
        riding[c.index] = (riding[c.index] ?? 0) + 1;
        by[c.index] = f.owner;
      }
    } else if (!gone) {
      if ((w.tick + i) % 10 === 0 || f.target < 0) {
        const t = prey(w, f.owner, f.x, f.y, 0, d.range ?? 180);
        f.target = t ? t.index : -1;
      }
      const t = f.target >= 0 ? w.cars[f.target]! : null;
      const sp = d.speed ?? 150;
      if (t && !t.wrecked) {
        const dx = t.x - f.x;
        const dy = t.y - f.y;
        const dist = Math.hypot(dx, dy) || 1;
        f.x += (dx / dist) * sp * DT + w.rng.range(-1, 1) * 0.6;
        f.y += (dy / dist) * sp * DT + w.rng.range(-1, 1) * 0.6;
        if (dist < CAR_RADIUS + 2 && within(t, 0) && t.z - t.deck < 5) {
          f.host = t.index;
          f.lx = w.rng.range(-0.7, 0.7) * t.def.body.halfLength;
          f.ly = w.rng.range(-0.7, 0.7) * t.def.body.halfWidth;
          f.t = d.life ?? 5;
          w.emit({ t: 'flea', car: t.index, x: f.x, y: f.y });
        }
      } else {
        // no one to bite: they mill about where they are
        f.x += w.rng.range(-1, 1) * sp * 0.3 * DT;
        f.y += w.rng.range(-1, 1) * sp * 0.3 * DT;
      }
      [f.x, f.y] = w.keepInside(f.x, f.y, 1);
    }
    if (gone) K.fleas.splice(i, 1);
  }
  // twice a second every bitten car takes the bites as one blow, and twitches
  if (w.tick % 30 !== 0) return;
  for (let i = 0; i < riding.length; i++) {
    const n = riding[i];
    if (!n) continue;
    const c = w.cars[i]!;
    const o = w.cars[by[i]!] ?? null;
    const f = K.fleas.find((f) => f.host === i)!;
    c.spin += w.rng.range(-1, 1) * Math.min(1.6, 0.4 * n);
    damage(w, c, n * (f.def.damage ?? 1.5) * 0.5, o && o !== c ? o : null, c.x, c.y);
  }
}

/** Where a flea is in the world now. */
export function fleaAt(w: World, f: Flea): [number, number] {
  if (f.host < 0) return [f.x, f.y];
  const c = w.cars[f.host]!;
  const cs = Math.cos(c.h);
  const sn = Math.sin(c.h);
  return [c.x + cs * f.lx - sn * f.ly, c.y + sn * f.lx + cs * f.ly];
}

// ---------------------------------------------------------------- the cutting ray

function updateBeams(w: World): void {
  const K = w.arsenal;
  for (let i = K.beams.length - 1; i >= 0; i--) {
    const b = K.beams[i]!;
    const d = b.def;
    const c = w.cars[b.car]!;
    b.t -= DT;
    if (b.t <= 0 || c.wrecked) {
      K.beams.splice(i, 1);
      w.emit({ t: 'beam', car: c.index, on: false });
      continue;
    }
    const cs = Math.cos(c.h);
    const sn = Math.sin(c.h);
    const nose = c.def.body.halfLength + 2;
    b.x = c.x + cs * nose;
    b.y = c.y + sn * nose;
    const range = d.range ?? 190;
    // every fourth tick it burns what it rests on; in between it only finds where it stops
    const burn = (w.tick + b.car) % 4 === 0;
    let x = b.x;
    let y = b.y;
    let on: Car | null = null;
    let st: StaticProp | null = null;
    for (let s = 0; s < range && !on && !st; s += 2.5) {
      x = b.x + cs * s;
      y = b.y + sn * s;
      const k = w.keepInside(x, y, 1);
      if (k[0] !== x || k[1] !== y) break;
      for (const o of w.cars)
        if (o !== c && within(o, c.deck) && Math.hypot(o.x - x, o.y - y) < CAR_RADIUS) on = o;
      st = wall(w, x, y, c.deck, 0);
      if (!burn) continue;
      for (const bt of w.bots)
        if (bt.alive && Math.hypot(bt.x - x, bt.y - y) < 4) squash(w, bt, c, cs * 60, sn * 60);
      for (const p of w.props) {
        if (!p.alive || p.flying || Math.hypot(p.x - x, p.y - y) > p.def.radius + 1) continue;
        if (p.def.explodesAt !== undefined) light(p, c.index, 0.15);
        else if (p.def.breaksAt !== undefined) breakProp(w, p, c);
      }
    }
    b.tx = x;
    b.ty = y;
    if (b.on >= 0 && (!on || on.index !== b.on)) b.owed = 0;
    b.on = on ? on.index : -1;
    if (on) b.owed += (d.damage ?? 26) * DT;
    if (!burn) continue;
    if (st) batter(w, st, 9 * d.power, 'heat', x, y);
    else if (!on && c.deck < 4) ignite(w, x, y, 3, c.index);
    if (on && b.owed > 1.5) {
      damage(w, on, b.owed, c, x, y);
      b.owed = 0;
    }
  }
}

// ---------------------------------------------------------------- the swap

/** Two cars change places: where each is, which way it points and how it is moving. */
function swap(w: World, a: Car, b: Car): void {
  const e = { t: 'swap' as const, a: a.index, b: b.index, ax: a.x, ay: a.y, bx: b.x, by: b.y };
  for (const k of ['x', 'y', 'z', 'vz', 'deck', 'h', 'vx', 'vy', 'vf', 'spin'] as const) {
    const v = a[k];
    a[k] = b[k];
    b[k] = v;
  }
  w.emit(e);
}

function updateBolts(w: World): void {
  const K = w.arsenal;
  for (let i = K.bolts.length - 1; i >= 0; i--) {
    const b = K.bolts[i]!;
    const d = b.def;
    const o = w.cars[b.owner]!;
    const v = d.speed ?? 460;
    const t = prey(w, b.owner, b.x, b.y, b.z, b.left, b.h, d.aim ?? 0.5);
    if (t) {
      const turn = (d.homing ?? 3) * DT;
      b.h += clamp(angDiff(Math.atan2(t.y - b.y, t.x - b.x), b.h), -turn, turn);
    }
    b.x += Math.cos(b.h) * v * DT;
    b.y += Math.sin(b.h) * v * DT;
    b.left -= v * DT;
    const hit = w.cars.find(
      (c) => c !== o && within(c, b.z) && Math.hypot(c.x - b.x, c.y - b.y) < CAR_RADIUS + 2,
    );
    if (hit && !o.wrecked) {
      K.bolts.splice(i, 1);
      swap(w, o, hit);
      continue;
    }
    const k = w.keepInside(b.x, b.y, 1);
    if (hit || b.left <= 0 || k[0] !== b.x || k[1] !== b.y || wall(w, b.x, b.y, b.z, 1) !== null) {
      K.bolts.splice(i, 1);
      w.emit({ t: 'fizz', x: b.x, y: b.y });
    }
  }
}

// ---------------------------------------------------------------- the trail of fire

function updateTrails(w: World): void {
  const K = w.arsenal;
  for (let i = K.trails.length - 1; i >= 0; i--) {
    const t = K.trails[i]!;
    const d = t.def;
    const c = w.cars[t.car]!;
    t.t -= DT;
    if (t.t <= 0 || c.wrecked) {
      K.trails.splice(i, 1);
      continue;
    }
    if (Math.hypot(c.x - t.lx, c.y - t.ly) < (d.reach ?? 14)) continue;
    t.lx = c.x;
    t.ly = c.y;
    // nothing burns up on a deck, in the air or on water
    if (c.deck > 4 || c.z > 4) continue;
    const back = c.def.body.halfLength + 4;
    const x = c.x - Math.cos(c.h) * back;
    const y = c.y - Math.sin(c.h) * back;
    if (w.spills.some((s) => s.def.quenches && Math.hypot(s.x - x, s.y - y) < s.r)) continue;
    const life = d.fuse ?? 3.5;
    const r = d.radius ?? 8;
    w.blazes.push({ x, y, r, t: life, bite: 0.25, owner: c.index });
    w.emit({ t: 'blaze', x, y, r, life });
  }
}

/** Move all of these on by one tick. */
export function updateArsenal(w: World): void {
  updateSticks(w);
  updateToys(w);
  updateHooks(w);
  updateStrikes(w);
  updateMoles(w);
  updateSentries(w);
  updateFleas(w);
  updateBeams(w);
  updateBolts(w);
  updateTrails(w);
  updateWild(w);
}

/**
 * For the test range: turn `owner` to face (x, y) and fire `def` from it, as if it had picked the
 * weapon up. A barrage comes down on the spot, and a turret is set down there.
 */
export function rangeArsenal(
  w: World,
  def: WeaponManifest,
  owner: Car,
  x: number,
  y: number,
): void {
  owner.h = Math.atan2(y - owner.y, x - owner.x);
  fireArsenal(w, owner, def, [x, y]);
  w.emit({ t: 'fire', car: owner.index, weapon: def.id });
}
