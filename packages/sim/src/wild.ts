import { CAR_RADIUS, DT, type WeaponManifest } from '@demodogs/shared';
import type { Car } from './entities';
import { angDiff, clamp } from './math';
import { batter, breakProp, damage, dig, explode, light, scatter, shed, spill } from './damage';
import { prey, squash, wall } from './arsenal';
import type { World } from './world';

/**
 * Six wilder arms, fired and stepped through `arsenal.ts`; every number is the manifest's.
 *
 * - `twister`: a whirlwind that wanders off down the road, drags in cars, drums and crates, lifts
 *   them, spins them and throws them out, and strips trees and fences as it passes.
 * - `flail`: a spiked ball on a chain that swings round the car, smashing whatever it reaches.
 * - `meteor`: a great bone out of the sky onto the car that is winning. Its shadow follows the car
 *   until just before it lands.
 * - `fissure`: the ground splits in a line ahead of the car, pit after pit, throwing up whatever
 *   stands on it and bringing down what is built beside it.
 * - `frost`: a snap of cold. Engines round the car die for a moment, fires go out, leaves fall,
 *   and the road behind is left a sheet of ice.
 * - `pit`: a deep hole dug behind the car. Whoever drives into it drops in and sits there with a
 *   dead engine until they climb out; it fills itself in after a while.
 */

export interface Twister {
  x: number;
  y: number;
  h: number;
  t: number;
  age: number;
  owner: number;
  def: WeaponManifest;
}

/** A car swinging a ball on a chain; `a` is the angle the chain is at. */
export interface Flail {
  car: number;
  t: number;
  a: number;
  def: WeaponManifest;
  /** Seconds before the ball can strike each car again, by car index. */
  cd: number[];
}

/** A bone on its way down. Its mark is at (x, y) and follows car `target` until it locks. */
export interface Bone {
  x: number;
  y: number;
  t: number;
  from: number;
  target: number;
  owner: number;
  def: WeaponManifest;
}

/** The running end of a split in the ground. */
export interface Crack {
  x: number;
  y: number;
  h: number;
  left: number;
  /** How far it runs before it opens the next pit. */
  next: number;
  owner: number;
  def: WeaponManifest;
  /** Cars it has already thrown. */
  hit: number[];
}

/** A hole in the ground, waiting. */
export interface Hole {
  x: number;
  y: number;
  r: number;
  t: number;
  age: number;
  owner: number;
  def: WeaponManifest;
  /** Seconds before it can catch each car again, by car index. */
  cd: number[];
}

export interface Wild {
  twisters: Twister[];
  flails: Flail[];
  bones: Bone[];
  cracks: Crack[];
  holes: Hole[];
}

export function newWild(): Wild {
  return { twisters: [], flails: [], bones: [], cracks: [], holes: [] };
}

const KINDS = new Set<WeaponManifest['kind']>([
  'twister',
  'flail',
  'meteor',
  'fissure',
  'frost',
  'pit',
]);

export function isWild(kind: WeaponManifest['kind'] | undefined): boolean {
  return kind !== undefined && KINDS.has(kind);
}

/** The car a bone is called down on: whoever is furthest on in a race, or soundest in a derby. */
function winning(w: World, me: Car): Car | null {
  let best: Car | null = null;
  for (const c of w.cars) {
    if (c === me || c.wrecked || c.finished) continue;
    if (!best) {
      best = c;
      continue;
    }
    const lead = w.kind === 'race' ? c.progress - best.progress : c.hp - best.hp;
    // nothing between them: the nearer one
    const nearer = Math.hypot(c.x - me.x, c.y - me.y) < Math.hypot(best.x - me.x, best.y - me.y);
    if (lead > 0 || (lead === 0 && nearer)) best = c;
  }
  return best;
}

/** Where a flail's ball is now. */
export function flailAt(w: World, f: Flail): [number, number] {
  const c = w.cars[f.car]!;
  const R = f.def.reach ?? 17;
  return [c.x + Math.cos(f.a) * R, c.y + Math.sin(f.a) * R];
}

/** For AI drivers: is now a good moment to use the weapon held? */
export function wildWants(w: World, c: Car): boolean {
  const d = c.weapon!;
  const R = d.range ?? 160;
  switch (d.kind) {
    case 'twister':
      return prey(w, c.index, c.x, c.y, c.deck, R, c.h, 0.5) !== null;
    case 'fissure':
      return prey(w, c.index, c.x, c.y, c.deck, R * 0.8, c.h, 0.2) !== null;
    case 'flail':
      return prey(w, c.index, c.x, c.y, c.deck, (d.reach ?? 17) * 2.5) !== null;
    case 'meteor': {
      // for a car that is ahead of this one, or anyone at all in a derby
      const t = winning(w, c);
      return t !== null && (w.kind !== 'race' || t.progress > c.progress) && w.rng.next() < 0.02;
    }
    case 'pit':
      // for whoever is on this car's tail
      return prey(w, c.index, c.x, c.y, c.deck, d.range ?? 90, c.h + Math.PI, 0.4) !== null;
    default:
      return prey(w, c.index, c.x, c.y, c.deck, (d.radius ?? 60) * 0.7) !== null;
  }
}

export function fireWild(w: World, c: Car, d: WeaponManifest, at?: [number, number]): void {
  const cs = Math.cos(c.h);
  const sn = Math.sin(c.h);
  const W = w.wild;
  switch (d.kind) {
    case 'twister': {
      const [x, y] = at ?? w.keepInside(c.x + cs * 34, c.y + sn * 34, 4);
      W.twisters.push({ x, y, h: c.h, t: d.life ?? 6, age: 0, owner: c.index, def: d });
      if (W.twisters.length > 4) W.twisters.shift();
      break;
    }
    case 'flail': {
      const f = W.flails.find((f) => f.car === c.index);
      if (f) f.t = d.life ?? 6;
      else W.flails.push({ car: c.index, t: d.life ?? 6, a: c.h + Math.PI, def: d, cd: [] });
      break;
    }
    case 'meteor': {
      const t = at ? null : winning(w, c);
      const fall = d.arm ?? 2.2;
      const [x, y] = at ?? (t ? [t.x, t.y] : [c.x + cs * 120, c.y + sn * 120]);
      W.bones.push({ x, y, t: fall, from: fall, target: t ? t.index : -1, owner: c.index, def: d });
      w.emit({ t: 'incoming', x, y, in: fall });
      break;
    }
    case 'fissure':
      W.cracks.push({
        x: c.x + cs * (c.def.body.halfLength + 4),
        y: c.y + sn * (c.def.body.halfLength + 4),
        h: c.h,
        left: d.range ?? 240,
        next: 0,
        owner: c.index,
        def: d,
        hit: [],
      });
      break;
    case 'pit': {
      const r = d.radius ?? 15;
      const back = c.def.body.halfLength + r + 5;
      const [x, y] = at ?? w.keepInside(c.x - cs * back, c.y - sn * back, r);
      const life = d.life ?? 14;
      W.holes.push({ x, y, r, t: life, age: 0, owner: c.index, def: d, cd: [] });
      if (W.holes.length > 12) fill(w, 0);
      w.emit({ t: 'pit', x, y, r, life });
      break;
    }
    default:
      frost(w, c, d);
  }
}

// ---------------------------------------------------------------- the twister

function updateTwisters(w: World): void {
  const W = w.wild;
  for (let i = W.twisters.length - 1; i >= 0; i--) {
    const t = W.twisters[i]!;
    const d = t.def;
    const R = d.radius ?? 46;
    const o = w.cars[t.owner] ?? null;
    t.t -= DT;
    t.age += DT;
    if (t.t <= 0) {
      W.twisters.splice(i, 1);
      continue;
    }
    // it wanders, leaning towards whoever is near
    t.h += w.rng.range(-1, 1) * 2.2 * DT;
    const p = prey(w, t.owner, t.x, t.y, 0, d.range ?? 160);
    if (p) {
      const turn = (d.homing ?? 0.8) * DT;
      t.h += clamp(angDiff(Math.atan2(p.y - t.y, p.x - t.x), t.h), -turn, turn);
    }
    const nx = t.x + Math.cos(t.h) * (d.speed ?? 70) * DT;
    const ny = t.y + Math.sin(t.h) * (d.speed ?? 70) * DT;
    const k = w.keepInside(nx, ny, 6);
    if (k[0] !== nx || k[1] !== ny) t.h += Math.PI;
    [t.x, t.y] = k;
    const pull = d.push ?? 520;
    const lift = d.lift ?? 170;
    const bite = w.tick % 30 === 0;
    for (const c of w.cars) {
      if (c.deck > 4 || (c === o && t.age < 1.5)) continue;
      const dx = t.x - c.x;
      const dy = t.y - c.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist > R) continue;
      const s = 1 - dist / R;
      // round and in
      c.vx += ((dx / dist) * 0.7 - dy / dist) * pull * s * DT;
      c.vy += ((dy / dist) * 0.7 + dx / dist) * pull * s * DT;
      c.spin += 20 * s * DT;
      if (dist < R * 0.5 && !(c.invuln > 0)) {
        c.vz = Math.max(c.vz, lift * s);
        c.z = Math.max(c.z, c.deck + 0.5);
      }
      if (bite && !c.wrecked && c !== o)
        damage(w, c, (d.damage ?? 5) * (0.5 + s), o && o !== c ? o : null, c.x, c.y);
    }
    for (const q of w.props) {
      if (!q.alive || q.flying) continue;
      const dx = t.x - q.x;
      const dy = t.y - q.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist > R) continue;
      const s = 1 - dist / R;
      const m = 1 / Math.max(0.5, q.def.mass ?? 1);
      q.vx += ((dx / dist) * 0.7 - dy / dist) * pull * 1.2 * s * m * DT;
      q.vy += ((dy / dist) * 0.7 + dx / dist) * pull * 1.2 * s * m * DT;
      q.spin += 12 * s * DT;
      if (dist < R * 0.5 && q.z < 1) q.vz = Math.max(q.vz, lift * s * m);
    }
    for (const b of w.bots)
      if (b.alive && Math.hypot(b.x - t.x, b.y - t.y) < R * 0.5)
        squash(w, b, o, w.rng.range(-120, 120), w.rng.range(-120, 120));
    if (w.tick % 12 !== 0) continue;
    // what stands in its way loses its leaves, and anything flimsy is torn up
    for (const s of w.near(t.x, t.y, R * 0.7)) {
      if (s.down) continue;
      const dist = Math.hypot(s.x - t.x, s.y - t.y);
      if (dist > R * 0.7 + s.def.radius) continue;
      if (s.leaves) shed(w, s, 0.12, 'blast', t.x, t.y);
      if (s.hp !== undefined) batter(w, s, 10 * d.power, 'blast', t.x, t.y);
    }
  }
}

// ---------------------------------------------------------------- the flail

function updateFlails(w: World): void {
  const W = w.wild;
  for (let i = W.flails.length - 1; i >= 0; i--) {
    const f = W.flails[i]!;
    const d = f.def;
    const c = w.cars[f.car]!;
    f.t -= DT;
    if (f.t <= 0 || c.wrecked) {
      W.flails.splice(i, 1);
      continue;
    }
    f.a += (d.speed ?? 8) * DT;
    const [x, y] = flailAt(w, f);
    const r = d.radius ?? 3.5;
    // the way the ball is travelling
    const tx = -Math.sin(f.a);
    const ty = Math.cos(f.a);
    for (const o of w.cars) {
      if (o === c || o.wrecked || Math.abs(o.deck - c.deck) > 8 || o.z - o.deck > 10) continue;
      if ((f.cd[o.index] ?? 0) > 0) {
        f.cd[o.index]! -= DT;
        continue;
      }
      if (Math.hypot(o.x - x, o.y - y) > CAR_RADIUS + r) continue;
      f.cd[o.index] = 0.35;
      o.vx += tx * (d.push ?? 140);
      o.vy += ty * (d.push ?? 140);
      o.spin += w.rng.range(-5, 5);
      damage(w, o, d.damage ?? 12, c, x, y);
      w.emit({ t: 'crash', x, y, impact: 200, player: false });
    }
    for (const b of w.bots)
      if (b.alive && Math.hypot(b.x - x, b.y - y) < r + 4) squash(w, b, c, tx * 160, ty * 160);
    for (const p of w.props) {
      if (!p.alive || p.flying || Math.hypot(p.x - x, p.y - y) > p.def.radius + r) continue;
      if (p.def.breaksAt !== undefined) {
        breakProp(w, p, c);
        continue;
      }
      if (p.def.explodesAt !== undefined) light(p, c.index, 0.3);
      p.vx += tx * 120;
      p.vy += ty * 120;
      p.vz = Math.max(p.vz, 60);
    }
    if ((w.tick + f.car) % 4 !== 0) continue;
    const st = wall(w, x, y, c.deck, r * 0.6);
    if (!st) continue;
    if (st.leaves) shed(w, st, 0.1, 'shake', x, y);
    if (st.hp !== undefined) batter(w, st, 26, 'impact', x, y);
    w.emit({ t: 'crash', x, y, impact: 110, player: false });
  }
}

// ---------------------------------------------------------------- the bone from the sky

function updateBones(w: World): void {
  const W = w.wild;
  for (let i = W.bones.length - 1; i >= 0; i--) {
    const b = W.bones[i]!;
    const d = b.def;
    b.t -= DT;
    const t = b.target >= 0 ? w.cars[b.target]! : null;
    // its mark keeps on the car until the last moment: then it is where it is, and can be dodged
    if (t && !t.wrecked && b.t > (d.fuse ?? 0.6)) {
      b.x += (t.x - b.x) * Math.min(1, 5 * DT);
      b.y += (t.y - b.y) * Math.min(1, 5 * DT);
    }
    if (b.t > 0) continue;
    W.bones.splice(i, 1);
    const o = w.cars[b.owner] ?? null;
    w.emit({ t: 'meteor', x: b.x, y: b.y });
    // whoever is right under it takes the bone itself before the blast
    for (const c of w.cars)
      if (!c.wrecked && c.deck < 4 && Math.hypot(c.x - b.x, c.y - b.y) < CAR_RADIUS + 8)
        damage(w, c, d.damage ?? 45, o && o !== c ? o : null, b.x, b.y);
    explode(w, b.x, b.y, d.power, o);
    // it throws burning bits a long way and leaves a ring of smaller pits round the big one
    scatter(w, b.x, b.y, 6, 10, 4, b.owner);
    const n = d.count ?? 5;
    const a0 = w.rng.range(0, Math.PI * 2);
    for (let k = 0; k < n; k++) {
      const a = a0 + (k / n) * Math.PI * 2;
      const r = 20 * d.power * w.rng.range(0.8, 1.2);
      dig(w, b.x + Math.cos(a) * r, b.y + Math.sin(a) * r, 0.7);
    }
  }
}

// ---------------------------------------------------------------- the fissure

function updateCracks(w: World): void {
  const W = w.wild;
  for (let i = W.cracks.length - 1; i >= 0; i--) {
    const k = W.cracks[i]!;
    const d = k.def;
    const step = (d.speed ?? 320) * DT;
    k.x += Math.cos(k.h) * step;
    k.y += Math.sin(k.h) * step;
    k.left -= step;
    k.next -= step;
    const e = w.keepInside(k.x, k.y, 4);
    const out = e[0] !== k.x || e[1] !== k.y;
    if (k.next <= 0 && !out) {
      k.next = d.reach ?? 11;
      open(w, k);
      // a crack never runs quite straight
      k.h += w.rng.range(-0.22, 0.22);
    }
    if (k.left <= 0 || out) W.cracks.splice(i, 1);
  }
}

/** The ground opens at the crack's end: a pit, and everything on it or beside it pays. */
function open(w: World, k: Crack): void {
  const d = k.def;
  const R = d.radius ?? 11;
  const o = w.cars[k.owner] ?? null;
  w.emit({ t: 'crack', x: k.x, y: k.y, h: k.h });
  dig(w, k.x, k.y, d.power);
  for (const c of w.cars) {
    if (c === o || c.wrecked || c.deck > 4 || c.z > 6 || k.hit.includes(c.index)) continue;
    if (Math.hypot(c.x - k.x, c.y - k.y) > R + CAR_RADIUS) continue;
    k.hit.push(c.index);
    const side = w.rng.next() < 0.5 ? -1 : 1;
    c.vx += -Math.sin(k.h) * side * 70;
    c.vy += Math.cos(k.h) * side * 70;
    c.vz = Math.max(c.vz, d.lift ?? 150);
    c.z = Math.max(c.z, 0.6);
    c.spin += w.rng.range(-6, 6);
    damage(w, c, d.damage ?? 20, o, k.x, k.y);
  }
  for (const b of w.bots)
    if (b.alive && Math.hypot(b.x - k.x, b.y - k.y) < R + 3)
      squash(w, b, o, w.rng.range(-60, 60), w.rng.range(-60, 60));
  for (const p of w.props) {
    if (!p.alive || p.flying || Math.hypot(p.x - k.x, p.y - k.y) > R + p.def.radius) continue;
    if (p.def.breaksAt !== undefined) {
      breakProp(w, p, o);
      continue;
    }
    p.vz = Math.max(p.vz, 110);
    p.vx += w.rng.range(-70, 70);
    p.vy += w.rng.range(-70, 70);
    p.spin += w.rng.range(-8, 8);
  }
  for (const s of w.near(k.x, k.y, R)) {
    if (s.down || s.hp === undefined) continue;
    if (Math.hypot(s.x - k.x, s.y - k.y) > R + s.def.radius) continue;
    batter(w, s, 70 * d.power, 'impact', k.x, k.y);
  }
}

// ---------------------------------------------------------------- the cold snap

function frost(w: World, c: Car, d: WeaponManifest): void {
  const R = d.radius ?? 60;
  w.emit({ t: 'frost', car: c.index, x: c.x, y: c.y, r: R });
  for (const o of w.cars) {
    if (o === c || o.wrecked || Math.abs(o.deck - c.deck) > 12) continue;
    if (Math.hypot(o.x - c.x, o.y - c.y) > R) continue;
    const time = d.stall ?? 1.4;
    o.stall = Math.max(o.stall ?? 0, time);
    w.emit({ t: 'stall', car: o.index, by: c.index, time });
    damage(w, o, d.damage ?? 6, c, o.x, o.y);
  }
  for (let i = w.blazes.length - 1; i >= 0; i--) {
    const b = w.blazes[i]!;
    if (Math.hypot(b.x - c.x, b.y - c.y) > R + b.r) continue;
    w.blazes.splice(i, 1);
    w.emit({ t: 'quench', x: b.x, y: b.y, r: b.r });
  }
  for (const s of w.near(c.x, c.y, R))
    if (!s.down && s.leaves && Math.hypot(s.x - c.x, s.y - c.y) < R)
      shed(w, s, 0.5, 'shake', c.x, c.y);
  // the road behind the car freezes over: nothing up on a deck, where there is no ground
  const m = d.material ? w.content.material.get(d.material) : undefined;
  if (!m || c.deck > 4) return;
  const bx = c.x - Math.cos(c.h) * R * 0.75;
  const by = c.y - Math.sin(c.h) * R * 0.75;
  const n = d.count ?? 6;
  spill(w, m, bx, by, R * 0.34, c.index);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + w.rng.range(-0.3, 0.3);
    const r = R * w.rng.range(0.3, 0.42);
    spill(w, m, bx + Math.cos(a) * r, by + Math.sin(a) * r, R * w.rng.range(0.2, 0.3), c.index);
  }
}

// ---------------------------------------------------------------- the pit

function fill(w: World, i: number): void {
  const h = w.wild.holes[i]!;
  w.wild.holes.splice(i, 1);
  w.emit({ t: 'fill', x: h.x, y: h.y, r: h.r });
}

function updateHoles(w: World): void {
  const W = w.wild;
  for (let i = W.holes.length - 1; i >= 0; i--) {
    const h = W.holes[i]!;
    const d = h.def;
    h.t -= DT;
    h.age += DT;
    if (h.t <= 0) {
      fill(w, i);
      continue;
    }
    const o = w.cars[h.owner] ?? null;
    for (const c of w.cars) {
      if (c.wrecked || c.deck > 4) continue;
      const dx = h.x - c.x;
      const dy = h.y - c.y;
      const dist = Math.hypot(dx, dy);
      if ((h.cd[c.index] ?? 0) > 0) {
        h.cd[c.index]! -= DT;
        // down in it: held near the middle until the engine turns over again
        if ((c.stall ?? 0) > 0 && dist < h.r + CAR_RADIUS) {
          c.vx = dx * 4;
          c.vy = dy * 4;
          c.vz = Math.min(c.vz, 0);
        }
        continue;
      }
      // the one who dug it has a moment to get clear; a car in the air sails over
      if (dist > h.r || c.z - c.deck > 3 || c.invuln > 0 || (c === o && h.age < 1.2)) continue;
      const time = d.stall ?? 1.6;
      h.cd[c.index] = time + 2;
      c.stall = Math.max(c.stall ?? 0, time);
      c.vx *= 0.1;
      c.vy *= 0.1;
      c.spin += w.rng.range(-4, 4);
      w.emit({ t: 'trap', car: c.index, x: h.x, y: h.y, time });
      damage(w, c, d.damage ?? 14, o && o !== c ? o : null, h.x, h.y);
    }
    for (const b of w.bots)
      if (b.alive && Math.hypot(b.x - h.x, b.y - h.y) < h.r) squash(w, b, o, 0, 0);
    for (const p of w.props) {
      if (!p.alive || p.flying || p.z > 2 || Math.hypot(p.x - h.x, p.y - h.y) > h.r) continue;
      if (p.def.breaksAt !== undefined) breakProp(w, p, o);
      else {
        // what rolls in stays in
        p.vx = (h.x - p.x) * 3;
        p.vy = (h.y - p.y) * 3;
      }
    }
  }
}

export function updateWild(w: World): void {
  updateHoles(w);
  updateTwisters(w);
  updateFlails(w);
  updateBones(w);
  updateCracks(w);
}
