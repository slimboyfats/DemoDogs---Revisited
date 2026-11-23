import { DT, type ModifierManifest } from '@demodogs/shared';
import { batter, explode, scatter, shed, spill } from './damage';
import type { Car, Spill } from './entities';
import { TAU } from './math';
import { stand } from './stand';
import type { World } from './world';

/**
 * World modifiers: weather and other things that change a whole venue for a race. A modifier is
 * content (a `modifier` manifest); what its kind does is here. Everything random comes from
 * `world.rng`, and a world with no modifiers draws nothing extra, so races without them run
 * exactly as before and races with them stay in step online.
 *
 * Each kind reports what happens (`omen`, `bolt`, `skyfall`, `quake`, `crack`, `gust`, `flood`,
 * and the usual `explode`, `spill`, `blaze` ...) and the client shows it.
 */

/** Something on its way down: it lands at (x, y) when `t` runs out. */
interface Pending {
  x: number;
  y: number;
  t: number;
}

/** One modifier at work in a world. */
export interface Mod {
  def: ModifierManifest;
  /** Seconds until its next event. */
  next: number;
  pending: Pending[];
  /** Pools laid and things left standing so far. */
  laid: number;
  left: number;
  /** Wind: the way it blows (radians), how hard right now, seconds the gust or lull has left. */
  a: number;
  v: number;
  turn: number;
  gusting: boolean;
  gustT: number;
  /** Quake: seconds of shaking left, and where it is hardest. */
  shakeT: number;
  qx: number;
  qy: number;
  /** Flood: its pools, and seconds the water has been rising. */
  pools: Spill[];
  age: number;
  /** Low gravity: whether each car was off the road last tick (a kerb is a ramp). */
  was: boolean[];
}

const between = (w: World, r: readonly [number, number]): number => w.rng.range(r[0], r[1]);

/** A point on the road (anywhere across it), or anywhere in an arena; clear of the start grid. */
function spot(w: World, wide = 0.8): [number, number] {
  const T = w.track;
  if (T) {
    const i = 30 + w.rng.int(Math.max(1, T.n - 70));
    const off = w.rng.range(-1, 1) * (w.road / 2) * wide;
    return [T.x[i]! - Math.sin(T.a[i]!) * off, T.y[i]! + Math.cos(T.a[i]!) * off];
  }
  const O = w.oval!;
  const t = w.rng.next() * TAU;
  const q = Math.sqrt(w.rng.next()) * 0.85;
  return [O.cx + Math.cos(t) * O.rx * q, O.cy + Math.sin(t) * O.ry * q];
}

/**
 * Where the sky aims: most often near a car, a little ahead of where it is going and off to one
 * side (a driver who sees the warning can get clear), otherwise anywhere on the road.
 */
function aim(w: World, lead: number, lo: number, hi: number): [number, number] {
  const c = w.cars[w.rng.int(w.cars.length)]!;
  if (c.wrecked || w.rng.next() < 0.3) return spot(w, 1.4);
  const a = w.rng.next() * TAU;
  const d = w.rng.range(lo, hi);
  return w.keepInside(c.x + c.vx * lead + Math.cos(a) * d, c.y + c.vy * lead + Math.sin(a) * d, 4);
}

function addPool(w: World, m: Mod, fixed: boolean): Spill | null {
  const P = m.def.pools;
  if (!P || m.laid >= P.max) return null;
  const def = w.content.material.get(P.material)!;
  const [x, y] = spot(w);
  const r = fixed && P.rise ? P.r[0] : between(w, P.r);
  m.laid++;
  if (!fixed) {
    spill(w, def, x, y, r, -1);
    return null;
  }
  // part of the map from here on: never dried up to make room for newer pools
  const s: Spill = { def, x, y, r, owner: -1, fixed: true };
  w.spills.push(s);
  // a world still being built is painted whole by the client; later, it has to be told
  if (w.tick > 0) w.emit({ t: 'spill', material: def.id, x, y, r });
  return s;
}

/** The world's numbers that modifiers set, from whichever are on. */
function tune(w: World): void {
  let grip = 1;
  let gravity = 1;
  let pace = 1;
  for (const m of w.mods) {
    grip *= m.def.grip;
    gravity *= m.def.gravity;
    pace *= m.def.pace;
  }
  w.grip = grip;
  w.gravity = gravity;
  w.blindPace = pace;
  if (!w.mods.some((m) => m.def.wind)) w.wind[0] = w.wind[1] = 0;
}

/** Switch a modifier on. Returns false if it already was. */
export function addModifier(w: World, def: ModifierManifest): boolean {
  if (w.mods.some((m) => m.def.id === def.id)) return false;
  const m: Mod = {
    def,
    next: def.every ? between(w, def.every) : 0,
    pending: [],
    laid: 0,
    left: 0,
    a: 0,
    v: 0,
    turn: 0,
    gusting: false,
    gustT: 0,
    shakeT: 0,
    qx: 0,
    qy: 0,
    pools: [],
    age: 0,
    was: [],
  };
  if (def.wind) {
    m.a = w.rng.next() * TAU;
    m.v = def.wind.steady;
    m.gustT = def.every ? between(w, def.every) : 4;
  }
  const P = def.pools;
  if (P)
    for (let i = 0; i < P.start; i++) {
      const s = addPool(w, m, true);
      if (s && P.rise) m.pools.push(s);
    }
  w.mods.push(m);
  tune(w);
  w.emit({ t: 'weather', id: def.id, on: true });
  return true;
}

/** Switch a modifier off. What it did to the map (pools, pits, fallen scenery) stays. */
export function removeModifier(w: World, id: string): boolean {
  const i = w.mods.findIndex((m) => m.def.id === id);
  if (i < 0) return false;
  w.mods.splice(i, 1);
  tune(w);
  w.emit({ t: 'weather', id, on: false });
  return true;
}

/** How fast car c may go for what it can see: a rival at night with its lamps gone is slower. */
export function pace(w: World, c: Car): number {
  return c.ai && !c.has.front ? w.blindPace : 1;
}

/** One tick of every modifier that is on. Events only come once the race is live. */
export function updateModifiers(w: World, live: boolean): void {
  for (const m of w.mods) {
    switch (m.def.kind) {
      case 'rain':
        rain(w, m, live);
        break;
      case 'wind':
        wind(w, m);
        break;
      case 'lightning':
        if (live && due(w, m)) omen(w, m, 'bolt', ...struck(w, m));
        break;
      case 'gravity':
        bumps(w, m);
        break;
      case 'quake':
        if (live && due(w, m)) omen(w, m, 'quake', ...aim(w, 0, 0, 90));
        shake(w, m);
        break;
      case 'flood':
        if (live) flood(w, m);
        break;
      case 'meteors':
        if (live && due(w, m)) omen(w, m, 'scrap', ...aim(w, m.def.warn * 0.8, 6, 55));
        break;
      case 'slick':
        if (live && due(w, m)) addPool(w, m, false);
        break;
      case 'tinder':
        tinder(w, m, live);
        break;
      case 'night':
        break;
    }
    for (let i = m.pending.length - 1; i >= 0; i--) {
      const p = m.pending[i]!;
      p.t -= DT;
      if (p.t > 0) continue;
      m.pending.splice(i, 1);
      land(w, m, p.x, p.y);
    }
  }
}

/** Is it time for this modifier's next event? Then the clock is set for the one after. */
function due(w: World, m: Mod): boolean {
  if (!m.def.every) return false;
  m.next -= DT;
  if (m.next > 0) return false;
  m.next = between(w, m.def.every);
  return true;
}

function omen(w: World, m: Mod, what: 'bolt' | 'scrap' | 'quake', x: number, y: number): void {
  m.pending.push({ x, y, t: m.def.warn });
  const r = what === 'quake' ? m.def.reach : 48 * m.def.power * 0.6;
  w.emit({ t: 'omen', what, x, y, r, in: m.def.warn });
}

/** What was on its way arrives. */
function land(w: World, m: Mod, x: number, y: number): void {
  const D = m.def;
  if (D.kind === 'lightning') strike(w, m, x, y);
  else if (D.kind === 'quake') quake(w, m, x, y);
  else if (D.kind === 'meteors') {
    w.emit({ t: 'skyfall', x, y, power: D.power });
    explode(w, x, y, D.power, null);
    scatter(w, x, y, 5, 3, 1, -1);
    // what is left of it stays where it fell, in the way, until somebody breaks it
    const L = D.leaves;
    if (L && m.left < L.max && w.rng.next() < L.chance) {
      const def = w.content.prop.get(L.prop)!;
      if (w.free(x, y, def.radius + 1)) {
        stand(w, def, x, y, w.rng.next() * TAU, w.rng.range(0, 10));
        m.left++;
      }
    }
  }
}

// ------------------------------------------------------------------ rain

/** Rain puts fires out, and now and then a puddle forms. (Its grip is in `tune`.) */
function rain(w: World, m: Mod, live: boolean): void {
  const D = m.def;
  if (D.douse > 0)
    for (let i = w.blazes.length - 1; i >= 0; i--) {
      if (w.rng.next() >= D.douse * DT) continue;
      const b = w.blazes[i]!;
      w.blazes.splice(i, 1);
      w.emit({ t: 'quench', x: b.x, y: b.y, r: b.r });
    }
  if (live && due(w, m)) addPool(w, m, false);
}

// ------------------------------------------------------------------ wind

/**
 * A wind that swings round and comes in gusts. It leans on cars (hardest on one in the air),
 * rolls light props along, carries rockets, burning bits and smoke off line, and in a gust it
 * tears leaves off the trees.
 */
function wind(w: World, m: Mod): void {
  const W = m.def.wind!;
  m.gustT -= DT;
  if (m.gustT <= 0) {
    m.gusting = !m.gusting;
    if (m.gusting) {
      m.gustT = w.rng.range(2.2, 4.2);
      m.turn = w.rng.range(-0.5, 0.5);
      w.emit({ t: 'gust', time: m.gustT });
    } else {
      m.gustT = m.def.every ? between(w, m.def.every) : 5;
      m.turn = w.rng.range(-0.12, 0.12);
    }
  }
  m.v += ((m.gusting ? W.gust : W.steady) - m.v) * Math.min(1, 1.8 * DT);
  m.a += m.turn * DT;
  const wx = (w.wind[0] = Math.cos(m.a) * m.v);
  const wy = (w.wind[1] = Math.sin(m.a) * m.v);
  for (const c of w.cars) {
    const air = c.z - c.deck > 0.6;
    const cs = Math.cos(c.h);
    const sn = Math.sin(c.h);
    // the wheels hold a car against a wind along its length; across it, it is a sail
    const along = (wx * cs + wy * sn) * (air ? 1 : 0.12);
    const side = -wx * sn + wy * cs;
    const k = ((air ? 1.7 : 1.25) * DT) / c.stats.mass;
    c.vx += (cs * along - sn * side) * k;
    c.vy += (sn * along + cs * side) * k;
    if (!air) c.spin += side * 0.0022 * DT * Math.min(1, Math.abs(c.vf) / 60);
  }
  for (const p of w.props) {
    if (!p.alive || p.flying) continue;
    const k = ((p.z > 0 ? 1.4 : 0.55) * DT) / Math.max(0.3, p.def.mass ?? 0.5);
    p.vx += wx * k;
    p.vy += wy * k;
  }
  for (const r of w.rockets) {
    r.x += wx * 0.3 * DT;
    r.y += wy * 0.3 * DT;
  }
  for (const e of w.embers) {
    e.vx += wx * 1.4 * DT;
    e.vy += wy * 1.4 * DT;
  }
  for (const c of w.clouds) [c.x, c.y] = w.keepInside(c.x + wx * 0.3 * DT, c.y + wy * 0.3 * DT, 4);
  // a gust shakes leaves out of a tree somewhere, several times a second
  if (m.gusting && w.statics.length && w.rng.next() < 9 * DT) {
    const s = w.statics[w.rng.int(w.statics.length)]!;
    if (s.def.crown && !s.down && s.leaves) shed(w, s, 0.05, 'shake', s.x - wx, s.y - wy);
  }
}

// ------------------------------------------------------------------ lightning

/** Where a bolt will come down: near a car, but it goes for a tree or a mast close by if it can. */
function struck(w: World, m: Mod): [number, number] {
  let [x, y] = aim(w, m.def.warn * 0.7, 16, 70);
  let best = 46;
  for (const s of w.near(x, y, 46)) {
    if (s.down || (!s.def.crown && s.hp === undefined)) continue;
    const d = Math.hypot(s.x - x, s.y - y) * (s.def.crown ? 0.6 : 1);
    if (d < best) {
      best = d;
      [x, y] = [s.x, s.y];
    }
  }
  return [x, y];
}

/**
 * The bolt: a blast where it lands, fire in whatever it struck, and every engine within reach
 * cut out. Water carries it: a car standing in a pool the bolt touched is caught as well.
 */
function strike(w: World, m: Mod, x: number, y: number): void {
  const D = m.def;
  w.emit({ t: 'bolt', x, y });
  // engines first: the blast that follows throws the cars it catches off the ground
  const wet = w.spills.filter((s) => s.def.conducts && Math.hypot(s.x - x, s.y - y) < s.r + 8);
  for (const c of w.cars) {
    if (c.wrecked || c.z - c.deck > 2 || c.deck > 4) continue;
    const near = Math.hypot(c.x - x, c.y - y) < D.reach;
    const soaked = wet.some((s) => Math.hypot(s.x - c.x, s.y - c.y) < s.r);
    if (!near && !soaked) continue;
    c.stall = Math.max(c.stall ?? 0, D.time);
    w.emit({ t: 'stall', car: c.index, by: -1, time: D.time });
  }
  explode(w, x, y, D.power, null);
  for (const s of w.near(x, y, 8))
    if (!s.down && s.hp !== undefined && Math.hypot(s.x - x, s.y - y) < s.def.radius + 4)
      batter(w, s, 45 * D.power, 'heat', x, y);
}

// ------------------------------------------------------------------ low gravity

/** With little gravity a kerb is a ramp, and rough ground throws a fast car up. */
function bumps(w: World, m: Mod): void {
  for (const c of w.cars) {
    const was = m.was[c.index] ?? c.offroad;
    m.was[c.index] = c.offroad;
    if (c.wrecked || c.z - c.deck > 0.6 || c.deck > 0) continue;
    const v = Math.abs(c.vf);
    if (was !== c.offroad && v > 70) c.vz = Math.max(c.vz, Math.min(75, v * 0.42));
    else if (c.offroad && v > 80 && w.rng.next() < 1.6 * DT) c.vz = Math.max(c.vz, v * 0.3);
  }
}

// ------------------------------------------------------------------ quake

/**
 * The ground goes: it splits open in cracks running out from the middle (pits in a row, which
 * cars lurch across), scenery is shaken hard enough to bring some of it down, and loose things
 * jump. The shaking itself goes on in `shake`.
 */
function quake(w: World, m: Mod, x: number, y: number): void {
  const D = m.def;
  m.shakeT = D.time;
  m.qx = x;
  m.qy = y;
  w.emit({ t: 'quake', x, y, r: D.reach, time: D.time });
  const a0 = w.rng.next() * TAU;
  const n = 3 + w.rng.int(2);
  for (let k = 0; k < n; k++) {
    let a = a0 + (k * TAU) / n + w.rng.range(-0.4, 0.4);
    let [px, py] = [x, y];
    const pts = [px, py];
    const segs = 6 + w.rng.int(5);
    for (let i = 0; i < segs; i++) {
      a += w.rng.range(-0.55, 0.55);
      const len = w.rng.range(9, 15);
      [px, py] = w.keepInside(px + Math.cos(a) * len, py + Math.sin(a) * len, 6);
      pts.push(px, py);
      w.craters.push({ x: px, y: py, r: 4 + 2 * D.power * (1 - i / segs) });
    }
    w.emit({ t: 'crack', pts });
  }
  if (w.craters.length > 160) w.craters.splice(0, w.craters.length - 160);
  for (const s of w.near(x, y, D.reach)) {
    if (s.down) continue;
    const k = 1 - Math.hypot(s.x - x, s.y - y) / D.reach;
    if (k <= 0) continue;
    if (s.hp !== undefined) batter(w, s, 60 * D.power * k * k, 'impact', s.x, s.y);
    else if (s.leaves) shed(w, s, 0.25 * k, 'shake', s.x, s.y);
  }
  for (const p of w.props) {
    if (!p.alive || p.flying) continue;
    const k = 1 - Math.hypot(p.x - x, p.y - y) / D.reach;
    if (k <= 0) continue;
    p.vz = Math.max(p.vz, 70 * k * D.power);
    p.vx += w.rng.range(-50, 50) * k;
    p.vy += w.rng.range(-50, 50) * k;
    p.spin += w.rng.range(-6, 6) * k;
  }
}

/** While the ground shakes, cars on it are thrown about: hardest in the middle, easing off. */
function shake(w: World, m: Mod): void {
  if (m.shakeT <= 0) return;
  const D = m.def;
  const ease = m.shakeT / D.time;
  m.shakeT -= DT;
  for (const c of w.cars) {
    if (c.z - c.deck > 0.6) continue;
    const k = (1 - Math.hypot(c.x - m.qx, c.y - m.qy) / D.reach) * ease * D.power;
    if (k <= 0) continue;
    c.vx += w.rng.range(-1, 1) * 420 * k * DT;
    c.vy += w.rng.range(-1, 1) * 420 * k * DT;
    c.spin += w.rng.range(-1, 1) * 26 * k * DT;
  }
}

// ------------------------------------------------------------------ flood

/** The water rises: every flood pool widens a little at a time, and drowns fire as it goes. */
function flood(w: World, m: Mod): void {
  const P = m.def.pools;
  if (!P?.rise || m.age >= P.rise) return;
  m.age = Math.min(P.rise, m.age + DT);
  const r = P.r[0] + (P.r[1] - P.r[0]) * (m.age / P.rise);
  for (const s of m.pools) {
    // told to the client in steps, so it repaints a pool a few times a second at most
    if (r - s.r < 1.5 && m.age < P.rise) continue;
    s.r = r;
    w.emit({ t: 'flood', material: s.def.id, x: s.x, y: s.y, r });
    if (!s.def.quenches) continue;
    for (let i = w.blazes.length - 1; i >= 0; i--) {
      const b = w.blazes[i]!;
      if (Math.hypot(b.x - s.x, b.y - s.y) > r + b.r * 0.5) continue;
      w.blazes.splice(i, 1);
      w.emit({ t: 'quench', x: b.x, y: b.y, r: b.r });
    }
  }
}

// ------------------------------------------------------------------ tinder

/**
 * Bone dry: a fire on the ground throws burning globs that start new fires where they land, and
 * now and then a patch of ground catches by itself.
 */
function tinder(w: World, m: Mod, live: boolean): void {
  const D = m.def;
  if (D.spread > 0)
    for (const b of w.blazes) {
      if (w.rng.next() >= D.spread * DT) continue;
      const a = w.rng.next() * TAU;
      const v = w.rng.range(25, 70);
      w.embers.push({
        kind: 'glob',
        x: b.x,
        y: b.y,
        z: 3,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        vz: w.rng.range(70, 120),
        owner: b.owner,
      });
    }
  if (!live || !due(w, m)) return;
  const [x, y] = spot(w, 2.2);
  if (w.spills.some((s) => s.def.quenches && Math.hypot(s.x - x, s.y - y) < s.r)) return;
  const life = w.rng.range(4, 6);
  w.blazes.push({ x, y, r: 8, t: life, bite: 0.25, owner: -1 });
  w.emit({ t: 'blaze', x, y, r: 8, life });
}

// ------------------------------------------------------------------ the test range

/**
 * Make a modifier's event happen at (x, y) now (with its usual warning): a bolt, a quake, scrap
 * from the sky, a new pool, a spot fire, a gust. For the test range.
 */
export function rangeEvent(w: World, def: ModifierManifest, x: number, y: number): void {
  addModifier(w, def);
  const m = w.mods.find((k) => k.def.id === def.id)!;
  switch (def.kind) {
    case 'lightning':
      omen(w, m, 'bolt', x, y);
      break;
    case 'quake':
      omen(w, m, 'quake', x, y);
      break;
    case 'meteors':
      omen(w, m, 'scrap', x, y);
      break;
    case 'rain':
    case 'slick':
    case 'flood': {
      const P = def.pools;
      if (P) spill(w, w.content.material.get(P.material)!, x, y, between(w, P.r), -1);
      break;
    }
    case 'tinder': {
      w.blazes.push({ x, y, r: 8, t: 5, bite: 0.25, owner: -1 });
      w.emit({ t: 'blaze', x, y, r: 8, life: 5 });
      break;
    }
    case 'wind':
      m.gusting = false;
      m.gustT = 0;
      m.a = Math.atan2(y - w.humans[0]!.y, x - w.humans[0]!.x);
      break;
    default:
      break;
  }
}
