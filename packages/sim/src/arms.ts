import { DT, GRAVITY, type WeaponManifest } from '@demodogs/shared';
import type { Car, StaticProp } from './entities';
import { angDiff } from './math';
import { batter, breakProp, damage, explode, ignite, light, shed, spill } from './damage';
import { bounced, fireproof, held, hidden } from './guards';
import type { World } from './world';
import {
  carGap,
  carShape,
  carsGap,
  newShape,
  newTouch,
  pointGap,
  propPoint,
  thingGap,
} from './shapes';

const SHAPE = newShape();
const TOUCH = newTouch();
import { startCoil, throwOrb, updateCoils, updateOrbs, type Coil, type Orb } from './arcs';

/**
 * The heavier arms: sprays (a jet of burning fuel, a water cannon), a rail slug that goes through
 * walls, a rolling wrecking ball, a lobbed fire shell and a sticky bomb that is passed car to car.
 * Each is a weapon `kind`; what it throws and how hard comes from the weapon's manifest.
 */

/** One drop of a spray, in flight. */
export interface Gob {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Seconds left before it falls to the ground. */
  t: number;
  owner: number;
  def: WeaponManifest;
}

/** A car in the middle of a spray burst. */
export interface Spray {
  car: number;
  t: number;
  def: WeaponManifest;
}

/** A sticky bomb: flying, clinging to a car, or lying on the ground. */
export interface Sticky {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** The car it clings to, or -1. Where on that car, in the car's own frame. */
  car: number;
  lx: number;
  ly: number;
  /** Still in flight; seconds of flight left. */
  flying: boolean;
  flight: number;
  /** Seconds until it blows; it starts counting once it clings or lands. */
  fuse: number;
  /** Seconds before it can be handed on again. */
  passCd: number;
  /** Whoever last had a hand in it: the blast is theirs. */
  owner: number;
  def: WeaponManifest;
}

/** A rolling wrecking ball. */
export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** How far it has rolled, for the client to turn it. */
  roll: number;
  t: number;
  owner: number;
  def: WeaponManifest;
}

/** A lobbed shell in the air. */
export interface Shell {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  owner: number;
  def: WeaponManifest;
}

export interface Arms {
  gobs: Gob[];
  sprays: Spray[];
  stickies: Sticky[];
  balls: Ball[];
  shells: Shell[];
  coils: Coil[];
  orbs: Orb[];
  /** Spray damage gathered per car this moment, handed out a few times a second. */
  soak: { amount: number; by: number; x: number; y: number }[];
}

export function newArms(): Arms {
  return {
    gobs: [],
    sprays: [],
    stickies: [],
    balls: [],
    shells: [],
    coils: [],
    orbs: [],
    soak: [],
  };
}

const ARMS_KINDS = new Set<WeaponManifest['kind']>([
  'spray',
  'rail',
  'ball',
  'lob',
  'sticky',
  'arc',
  'vortex',
]);

/** Is this one of the kinds this module fires? */
export function isArms(kind: WeaponManifest['kind'] | undefined): boolean {
  return kind !== undefined && ARMS_KINDS.has(kind);
}

/** The nearest running rival within `d` and `cone` radians of c's nose. */
function prey(w: World, c: Car, d: number, cone: number): Car | null {
  let best: Car | null = null;
  let bd = d;
  for (const o of w.cars) {
    if (o === c || o.wrecked || o.z > 10 || hidden(o)) continue;
    const dd = Math.hypot(o.x - c.x, o.y - c.y);
    if (dd < bd && Math.abs(angDiff(Math.atan2(o.y - c.y, o.x - c.x), c.h)) < cone) {
      bd = dd;
      best = o;
    }
  }
  return best;
}

/** For AI drivers: is now a good moment to use the heavy weapon held? */
export function armsWants(w: World, c: Car): boolean {
  const d = c.weapon;
  if (!d || !isArms(d.kind) || c.fireCd > 0) return false;
  switch (d.kind) {
    case 'spray':
      return prey(w, c, (d.range ?? 120) * 0.85, 0.3) !== null;
    case 'rail':
      return prey(w, c, d.range ?? 400, 0.07) !== null;
    case 'ball':
      return prey(w, c, 240, 0.22) !== null;
    case 'lob':
      return prey(w, c, d.range ?? 240, 0.5) !== null;
    case 'arc':
      return prey(w, c, (d.range ?? 120) * 0.9, 0.8) !== null;
    case 'vortex':
      return prey(w, c, 150, 0.35) !== null;
    default:
      return prey(w, c, 170, 0.18) !== null;
  }
}

/** Fire one of these arms from car c. The caller has spent the round and set the cooldown. */
export function fireArms(w: World, c: Car, d: WeaponManifest, at?: [number, number]): void {
  const cs = Math.cos(c.h);
  const sn = Math.sin(c.h);
  const nose = (c.def.body.halfLength + 2) * c.size;
  const x = c.x + cs * nose;
  const y = c.y + sn * nose;
  const A = w.arms;
  if (d.kind === 'spray') {
    const s = A.sprays.find((s) => s.car === c.index);
    if (s) s.t = d.life ?? 0.9;
    else A.sprays.push({ car: c.index, t: d.life ?? 0.9, def: d });
  } else if (d.kind === 'rail') rail(w, c, d, x, y, c.h);
  else if (d.kind === 'ball') {
    const v = (d.speed ?? 240) + Math.max(0, c.vf);
    const r = d.radius ?? 4.5;
    A.balls.push({
      x: c.x + cs * (nose + r),
      y: c.y + sn * (nose + r),
      vx: cs * v,
      vy: sn * v,
      roll: 0,
      t: d.life ?? 6,
      owner: c.index,
      def: d,
    });
  } else if (d.kind === 'lob') lob(w, c, d, at);
  else if (d.kind === 'arc') startCoil(w, c, d);
  else if (d.kind === 'vortex') throwOrb(w, c, d, at);
  else
    A.stickies.push({
      x,
      y,
      vx: c.vx + cs * (d.speed ?? 300),
      vy: c.vy + sn * (d.speed ?? 300),
      car: -1,
      lx: 0,
      ly: 0,
      flying: true,
      flight: 0.9,
      fuse: d.fuse ?? 2.5,
      passCd: 0,
      owner: c.index,
      def: d,
    });
}

// ---------------------------------------------------------------- sprays

/** Let this tick's drops go from every car that is spraying. */
function spray(w: World): void {
  const A = w.arms;
  for (let i = A.sprays.length - 1; i >= 0; i--) {
    const s = A.sprays[i]!;
    const c = w.cars[s.car]!;
    s.t -= DT;
    if (s.t <= 0 || c.wrecked) {
      A.sprays.splice(i, 1);
      continue;
    }
    const d = s.def;
    const v = d.speed ?? 200;
    const life = (d.range ?? 110) / v;
    const nose = (c.def.body.halfLength + 2) * c.size;
    for (let k = 0; k < 2; k++) {
      const a = c.h + w.rng.range(-1, 1) * (d.spread ?? 0.15);
      const sp = v * w.rng.range(0.85, 1.1);
      A.gobs.push({
        x: c.x + Math.cos(c.h) * nose,
        y: c.y + Math.sin(c.h) * nose,
        z: 4,
        vx: c.vx + Math.cos(a) * sp,
        vy: c.vy + Math.sin(a) * sp,
        vz: w.rng.range(10, 40),
        t: life * w.rng.range(0.8, 1.05),
        owner: c.index,
        def: d,
      });
    }
  }
  if (A.gobs.length > 320) A.gobs.splice(0, A.gobs.length - 320);
}

/** Where a drop comes down it may leave a little of what it is: fire, or a puddle. */
function settle(w: World, g: Gob): void {
  const d = g.def;
  if (w.rng.next() > 0.18) return;
  const [x, y] = w.keepInside(g.x, g.y, 2);
  if (d.lit) {
    if (w.spills.some((s) => s.def.quenches && Math.hypot(s.x - x, s.y - y) < s.r)) {
      w.emit({ t: 'quench', x, y, r: 3 });
      return;
    }
    if (w.blazes.some((b) => Math.hypot(b.x - x, b.y - y) < b.r * 0.7)) return;
    const life = w.rng.range(2, 3.5);
    w.blazes.push({ x, y, r: 6, t: life, bite: 0.2, owner: g.owner });
    w.emit({ t: 'blaze', x, y, r: 6, life });
  } else if (d.material) {
    if (w.spills.some((s) => s.def.id === d.material && Math.hypot(s.x - x, s.y - y) < s.r * 0.6))
      return;
    spill(w, w.content.material.get(d.material)!, x, y, 6, g.owner);
  }
}

function updateGobs(w: World): void {
  const A = w.arms;
  for (let i = A.gobs.length - 1; i >= 0; i--) {
    const g = A.gobs[i]!;
    const d = g.def;
    g.t -= DT;
    g.x += g.vx * DT;
    g.y += g.vy * DT;
    g.vz -= GRAVITY * 0.35 * DT;
    g.z = Math.max(0.5, g.z + g.vz * DT);
    // air drags at a jet as it spreads
    const f = Math.exp(-1.4 * DT);
    g.vx *= f;
    g.vy *= f;
    let gone = g.t <= 0;
    const k = w.keepInside(g.x, g.y, 1);
    if (k[0] !== g.x || k[1] !== g.y) gone = true;
    // a car in the jet: scalded, or knocked aside by the water
    for (const c of w.cars) {
      if (gone) break;
      if (c.index === g.owner || c.wrecked || c.z > 8) continue;
      if (Math.abs(c.x - g.x) > 40 || carGap(c, g.x, g.y) > 3) continue;
      const sp = Math.hypot(g.vx, g.vy) || 1;
      const push = (d.push ?? 0) * (d.push ? held(w, c) : 1);
      c.vx += (g.vx / sp) * push;
      c.vy += (g.vy / sp) * push;
      if (push) c.spin += w.rng.range(-0.25, 0.25);
      if (d.damage && !(d.lit && fireproof(c))) {
        const S = (A.soak[c.index] ??= { amount: 0, by: -1, x: 0, y: 0 });
        S.amount += d.damage;
        S.by = g.owner;
        S.x = g.x;
        S.y = g.y;
      }
      w.emit({ t: 'splash', x: g.x, y: g.y, lit: !!d.lit });
      gone = true;
    }
    if (!gone)
      for (const s of w.near(g.x, g.y, 2)) {
        if (s.down || !s.def.solid) continue;
        if (thingGap(s, g.x, g.y) > 1) continue;
        if (d.lit) batter(w, s, 1.6, 'heat', g.x, g.y);
        w.emit({ t: 'splash', x: g.x, y: g.y, lit: !!d.lit });
        gone = true;
        break;
      }
    if (d.lit) {
      // burning fuel: it lights every pool it crosses, every drum it touches, every crown it licks
      if ((w.tick + i) % 3 === 0) {
        ignite(w, g.x, g.y, 3, g.owner);
        for (const p of w.props)
          if (
            p.alive &&
            p.def.explodesAt !== undefined &&
            Math.hypot(p.x - g.x, p.y - g.y) < p.def.radius + 3
          )
            light(p, g.owner, 0.25 + w.rng.next() * 0.3);
        for (const s of w.near(g.x, g.y, 4))
          if (s.leaves && !s.down && Math.hypot(s.x - g.x, s.y - g.y) < s.def.radius + 4) {
            shed(w, s, 0.02, 'heat', g.x, g.y);
            if (w.rng.next() < 0.01 && !w.blazes.some((b) => b.x === s.x && b.y === s.y)) {
              w.blazes.push({
                x: s.x,
                y: s.y,
                r: s.def.radius + 3,
                t: 4,
                bite: 0.25,
                owner: g.owner,
              });
              w.emit({ t: 'blaze', x: s.x, y: s.y, r: s.def.radius + 3, life: 4 });
            }
          }
      }
    } else if (d.material && w.content.material.get(d.material)?.quenches) {
      // water: puts out the fire it falls on, and shoves loose things along
      for (let j = w.blazes.length - 1; j >= 0; j--) {
        const b = w.blazes[j]!;
        if (Math.hypot(b.x - g.x, b.y - g.y) > b.r + 2) continue;
        b.t -= 0.35;
        if (b.t <= 0) {
          w.blazes.splice(j, 1);
          w.emit({ t: 'quench', x: b.x, y: b.y, r: b.r });
        }
      }
      for (const p of w.props) {
        if (!p.alive || p.flying || thingGap(p, g.x, g.y) > 2) continue;
        const m = 1 / Math.max(0.5, p.def.mass ?? 1);
        p.vx += g.vx * 0.06 * m;
        p.vy += g.vy * 0.06 * m;
        if (p.fuse > 0) p.fuse += DT * 2;
      }
    }
    if (gone) {
      A.gobs.splice(i, 1);
      settle(w, g);
    }
  }
  // hand out the scalding a few times a second, so a car takes it as a few blows, not hundreds
  if (w.tick % 6 === 0)
    A.soak.forEach((S, i) => {
      if (!S || S.amount <= 0) return;
      const c = w.cars[i]!;
      const by = S.by >= 0 ? w.cars[S.by]! : null;
      damage(w, c, S.amount, by && by !== c ? by : null, S.x, S.y);
      S.amount = 0;
    });
}

// ---------------------------------------------------------------- rail

/** Is static s in the way at (x, y)? */
function blocks(s: StaticProp, x: number, y: number, pad: number): boolean {
  if (s.down || !s.def.solid) return false;
  return thingGap(s, x, y) < pad;
}

/**
 * The slug crosses its whole range in one tick. Every car on the line is struck; scenery it can
 * break is punched through (up to `pierce` pieces); anything it cannot is where it stops.
 */
export function rail(w: World, c: Car, d: WeaponManifest, x0: number, y0: number, h: number): void {
  const cs = Math.cos(h);
  const sn = Math.sin(h);
  const range = d.range ?? 400;
  let left = d.pierce ?? 3;
  const struck = new Set<number>();
  const punched = new Set<number>();
  let x = x0;
  let y = y0;
  for (let s = 0; s < range; s += 2.5) {
    x = x0 + cs * s;
    y = y0 + sn * s;
    const k = w.keepInside(x, y, 1);
    if (k[0] !== x || k[1] !== y) {
      [x, y] = k;
      break;
    }
    for (const o of w.cars) {
      if (o === c || o.wrecked || o.z > 10 || struck.has(o.index)) continue;
      if (Math.abs(o.x - x) > 40 || carGap(o, x, y) > 1.5) continue;
      struck.add(o.index);
      // a mirrored car turns the slug: half of it comes back down the line
      const back = bounced(w, o, c, x, y, (d.damage ?? 30) * 0.5);
      if (back) {
        damage(w, c, back, o, c.x, c.y);
        continue;
      }
      o.vx += cs * 90;
      o.vy += sn * 90;
      o.spin += w.rng.range(-3, 3);
      damage(w, o, d.damage ?? 30, c, x, y);
    }
    for (const b of w.bots) {
      if (!b.alive || Math.hypot(b.x - x, b.y - y) > 5) continue;
      b.alive = false;
      b.deadT = w.rng.range(b.def.respawn[0], b.def.respawn[1]);
      w.emit({ t: 'smash', bot: b.index, by: c.index, x: b.x, y: b.y, vx: cs * 200, vy: sn * 200 });
      c.score += b.def.points;
      c.smashed++;
    }
    for (const p of w.props) {
      if (!p.alive || p.flying || thingGap(p, x, y) > 1) continue;
      if (p.def.explodesAt !== undefined) light(p, c.index, 0.05);
      else if (p.def.breaksAt !== undefined) breakProp(w, p, c);
      p.vx += cs * 160;
      p.vy += sn * 160;
    }
    let stop = false;
    for (const st of w.near(x, y, 2)) {
      if (punched.has(st.index) || !blocks(st, x, y, 0)) continue;
      punched.add(st.index);
      if (st.leaves) shed(w, st, 0.15, 'blast', x, y);
      const fell = st.hp !== undefined && left > 0 && batter(w, st, 220, 'impact', x, y);
      if (fell) left--;
      else {
        // it holds: a deep bite where the slug went in, and the slug stops there
        if (st.hp !== undefined) batter(w, st, 40, 'impact', x, y);
        stop = true;
      }
    }
    if (stop) break;
  }
  w.emit({ t: 'rail', car: c.index, x: x0, y: y0, tx: x, ty: y });
}

// ---------------------------------------------------------------- the wrecking ball

function updateBalls(w: World): void {
  const A = w.arms;
  for (let i = A.balls.length - 1; i >= 0; i--) {
    const b = A.balls[i]!;
    const d = b.def;
    const r = d.radius ?? 4.5;
    const owner = w.cars[b.owner] ?? null;
    b.t -= DT;
    // it rolls a long way, slowed only a little, and a lot in a pit or in mud
    let drag = 0.18;
    for (const p of w.craters) if (Math.hypot(p.x - b.x, p.y - b.y) < p.r) drag = 1.6;
    for (const s of w.spills) if (Math.hypot(s.x - b.x, s.y - b.y) < s.r) drag += s.def.drag;
    const f = Math.exp(-drag * DT);
    b.vx *= f;
    b.vy *= f;
    const nx = b.x + b.vx * DT;
    const ny = b.y + b.vy * DT;
    let sp = Math.hypot(b.vx, b.vy);
    b.roll += sp * DT;
    const k = w.keepInside(nx, ny, r);
    if (k[0] !== nx || k[1] !== ny) {
      // off the edge of the world: it bounces back the way it came
      const ex = nx - k[0];
      const ey = ny - k[1];
      const el = Math.hypot(ex, ey) || 1;
      const dot = (b.vx * ex + b.vy * ey) / el;
      if (dot > 0) {
        b.vx -= (1.7 * dot * ex) / el;
        b.vy -= (1.7 * dot * ey) / el;
        w.emit({ t: 'crash', x: k[0], y: k[1], impact: dot, player: false });
      }
      [b.x, b.y] = k;
    } else {
      b.x = nx;
      b.y = ny;
    }
    // a ball meets scenery low down, where it is narrower: it squeezes through the gap it makes
    const rs = r * 0.6;
    for (const s of w.near(b.x, b.y, r)) {
      if (!blocks(s, b.x, b.y, rs)) continue;
      // the way out of it, off whichever face the ball met
      const gap = propPoint(s.def, s.x, s.y, s.rot, b.x, b.y, TOUCH);
      const dx = TOUCH.nx;
      const dy = TOUCH.ny;
      const dl = 1;
      const into = -(b.vx * dx + b.vy * dy) / dl;
      if (into <= 0) continue;
      // what it took to bring the piece down, as a share of the blow: that much speed is spent
      const cost = ((s.hp ?? 0) * (s.made?.strength.impact ?? 1)) / (into * 0.8);
      const fell = s.hp !== undefined && batter(w, s, into * 0.8, 'impact', b.x, b.y);
      w.emit({
        t: 'crash',
        x: b.x - (dx / dl) * rs,
        y: b.y - (dy / dl) * rs,
        impact: into,
        player: false,
      });
      if (fell) {
        // straight through it, slowed by what it took
        const k = Math.sqrt(Math.max(0.2, 1 - 0.5 * Math.min(1, cost)));
        b.vx *= k;
        b.vy *= k;
        if (owner && s.def.points) owner.score += s.def.points;
      } else {
        b.vx += (1.65 * into * dx) / dl;
        b.vy += (1.65 * into * dy) / dl;
        b.x += dx * (rs + 0.1 - gap);
        b.y += dy * (rs + 0.1 - gap);
      }
    }
    sp = Math.hypot(b.vx, b.vy);
    for (const c of w.cars) {
      if (c.wrecked || c.z > 6 || (c.index === b.owner && b.t > (d.life ?? 6) - 0.5)) continue;
      if (Math.abs(c.x - b.x) > 60 || Math.abs(c.y - b.y) > 60) continue;
      if (pointGap(carShape(c, SHAPE), b.x, b.y, TOUCH) > r) continue;
      // from the ball into the car, through the side of it the ball met
      const dx = -TOUCH.nx;
      const dy = -TOUCH.ny;
      const dl = 1;
      // how hard they meet: the ball's speed into the car, less the car's own speed away
      const rel = ((b.vx - c.vx) * dx + (b.vy - c.vy) * dy) / dl;
      if (rel <= 20) continue;
      c.vx += (dx / dl) * rel * 0.75;
      c.vy += (dy / dl) * rel * 0.75;
      c.vz = Math.max(c.vz, rel * 0.25);
      c.z = Math.max(c.z, 0.5);
      c.spin += w.rng.range(-4, 4);
      b.vx -= (dx / dl) * rel * 0.6;
      b.vy -= (dy / dl) * rel * 0.6;
      damage(
        w,
        c,
        rel * (d.damage ?? 0.12),
        owner && owner !== c ? owner : null,
        b.x + (dx / dl) * r,
        b.y + (dy / dl) * r,
      );
      w.emit({
        t: 'crash',
        x: b.x + (dx / dl) * r,
        y: b.y + (dy / dl) * r,
        impact: rel,
        player: c === w.player,
      });
    }
    for (const bt of w.bots) {
      if (!bt.alive || sp < 40 || Math.hypot(bt.x - b.x, bt.y - b.y) > r + 4) continue;
      bt.alive = false;
      bt.deadT = w.rng.range(bt.def.respawn[0], bt.def.respawn[1]);
      w.emit({ t: 'smash', bot: bt.index, by: b.owner, x: bt.x, y: bt.y, vx: b.vx, vy: b.vy });
      if (owner) {
        owner.score += bt.def.points;
        owner.smashed++;
      }
    }
    for (const p of w.props) {
      if (!p.alive || p.flying || p.z > 6) continue;
      const dx = p.x - b.x;
      const dy = p.y - b.y;
      const dl = Math.hypot(dx, dy) || 1;
      if (thingGap(p, b.x, b.y) > r) continue;
      if (p.def.breaksAt !== undefined && sp > p.def.breaksAt) {
        breakProp(w, p, owner);
        continue;
      }
      if (p.def.explodesAt !== undefined && sp > p.def.explodesAt) light(p, b.owner, 0.1);
      p.vx += (dx / dl) * sp * 0.9;
      p.vy += (dy / dl) * sp * 0.9;
      p.vz = Math.max(p.vz, sp * 0.3);
      p.spin += w.rng.range(-8, 8);
    }
    if (b.t <= 0 || sp < 12) A.balls.splice(i, 1);
  }
  if (A.balls.length > 6) A.balls.splice(0, 1);
}

// ---------------------------------------------------------------- the fire shell

/** Throw the shell high, to land on the car ahead (where it will be), or `range` ahead. */
function lob(w: World, c: Car, d: WeaponManifest, at?: [number, number]): void {
  const T = 1.1;
  const t = prey(w, c, d.range ?? 240, 0.5);
  let tx: number;
  let ty: number;
  if (at) [tx, ty] = at;
  else if (t) {
    tx = t.x + t.vx * T;
    ty = t.y + t.vy * T;
  } else {
    tx = c.x + Math.cos(c.h) * (d.range ?? 240) * 0.75 + c.vx * T * 0.5;
    ty = c.y + Math.sin(c.h) * (d.range ?? 240) * 0.75 + c.vy * T * 0.5;
  }
  const g = GRAVITY * 0.6;
  w.arms.shells.push({
    x: c.x,
    y: c.y,
    z: 10,
    vx: (tx - c.x) / T,
    vy: (ty - c.y) / T,
    vz: (g * T) / 2 - 10 / T,
    owner: c.index,
    def: d,
  });
}

function updateShells(w: World): void {
  const A = w.arms;
  for (let i = A.shells.length - 1; i >= 0; i--) {
    const s = A.shells[i]!;
    s.vz -= GRAVITY * 0.6 * DT;
    s.x += s.vx * DT;
    s.y += s.vy * DT;
    s.z += s.vz * DT;
    const k = w.keepInside(s.x, s.y, 2);
    let down = s.z <= 0 || k[0] !== s.x || k[1] !== s.y;
    if (!down && s.z < 12) down = w.near(s.x, s.y, 2).some((st) => blocks(st, s.x, s.y, 1));
    if (!down) continue;
    A.shells.splice(i, 1);
    burst(w, s, k[0], k[1]);
  }
}

/** The shell bursts: a blast, then burning fuel thrown in a ring round it. */
function burst(w: World, s: Shell, x: number, y: number): void {
  const d = s.def;
  const owner = w.cars[s.owner] ?? null;
  explode(w, x, y, d.power, owner);
  const m = d.material ? w.content.material.get(d.material) : undefined;
  if (!m) return;
  const n = d.count ?? 6;
  const r = d.radius ?? 8;
  const a0 = w.rng.range(0, Math.PI * 2);
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * Math.PI * 2 + w.rng.range(-0.3, 0.3);
    const dd = i === 0 ? 0 : r * w.rng.range(1, 2.4);
    spill(w, m, x + Math.cos(a) * dd, y + Math.sin(a) * dd, r * w.rng.range(0.8, 1.15), s.owner);
  }
  ignite(w, x, y, r * 3.5, s.owner);
}

// ---------------------------------------------------------------- the sticky bomb

/** Where a sticky is in the world now. */
export function stickyAt(w: World, s: Sticky): [number, number] {
  if (s.car < 0) return [s.x, s.y];
  const c = w.cars[s.car]!;
  // it rides on the roof of a car of any size
  const cs = Math.cos(c.h) * c.size;
  const sn = Math.sin(c.h) * c.size;
  return [c.x + cs * s.lx - sn * s.ly, c.y + sn * s.lx + cs * s.ly];
}

function cling(w: World, s: Sticky, c: Car, x: number, y: number): void {
  const cs = Math.cos(c.h);
  const sn = Math.sin(c.h);
  const dx = x - c.x;
  const dy = y - c.y;
  const hl = c.def.body.halfLength;
  s.car = c.index;
  // on the roof, near where it struck
  s.lx = Math.max(-hl * 0.7, Math.min(hl * 0.7, dx * cs + dy * sn));
  s.ly = Math.max(-2.5, Math.min(2.5, -dx * sn + dy * cs));
  s.flying = false;
  w.emit({ t: 'stick', car: c.index, x, y });
}

function updateStickies(w: World): void {
  const A = w.arms;
  for (let i = A.stickies.length - 1; i >= 0; i--) {
    const s = A.stickies[i]!;
    s.passCd -= DT;
    if (s.flying) {
      s.flight -= DT;
      s.x += s.vx * DT;
      s.y += s.vy * DT;
      const hit = w.cars.find(
        (c) => c.index !== s.owner && !c.wrecked && c.z < 10 && carGap(c, s.x, s.y) < 2,
      );
      if (hit && bounced(w, hit, w.cars[s.owner], s.x, s.y, 1)) {
        // a mirrored car bats the dart back: it is the thrower's problem now
        s.vx = -s.vx;
        s.vy = -s.vy;
        s.owner = hit.index;
        s.flight = 0.9;
        continue;
      }
      if (hit) {
        cling(w, s, hit, s.x, s.y);
        continue;
      }
      const k = w.keepInside(s.x, s.y, 1);
      const wall = w.near(s.x, s.y, 2).some((st) => blocks(st, s.x, s.y, 1));
      if (s.flight <= 0 || wall || k[0] !== s.x || k[1] !== s.y) {
        // it lands where it is and lies there ticking: a trap for whoever comes over it
        [s.x, s.y] = k;
        s.flying = false;
        s.passCd = 0.4;
        w.emit({ t: 'stick', car: -1, x: s.x, y: s.y });
      }
      continue;
    }
    s.fuse -= DT;
    const [x, y] = stickyAt(w, s);
    if (s.car < 0) {
      // lying on the ground: the first car over it picks it up
      const c =
        s.passCd > 0 ? undefined : w.cars.find((c) => !c.wrecked && c.z < 5 && carGap(c, x, y) < 1);
      if (c) cling(w, s, c, x, y);
    } else if (s.passCd <= 0) {
      // clinging to a car: touch another and it is theirs
      const from = w.cars[s.car]!;
      const to = w.cars.find(
        (o) => o !== from && !o.wrecked && Math.abs(o.z - from.z) < 6 && carsGap(o, from) < 3,
      );
      if (to) {
        s.owner = from.index;
        s.passCd = 0.6;
        cling(w, s, to, (x + to.x) / 2, (y + to.y) / 2);
        w.emit({ t: 'pass', from: from.index, to: to.index, x, y });
      }
    }
    if (s.fuse > 0) continue;
    A.stickies.splice(i, 1);
    const [bx, by] = stickyAt(w, s);
    const by0 = w.cars[s.owner] ?? null;
    // the car wearing it takes the full force before the blast throws it
    const wearer = s.car >= 0 ? w.cars[s.car]! : null;
    if (wearer) damage(w, wearer, 28 * s.def.power, by0 && by0 !== wearer ? by0 : null, bx, by);
    explode(w, bx, by, s.def.power, by0);
  }
  if (A.stickies.length > 8) A.stickies.splice(0, 1);
}

/** Move every heavy weapon on by one tick. */
export function updateArms(w: World): void {
  spray(w);
  updateGobs(w);
  updateBalls(w);
  updateShells(w);
  updateStickies(w);
  updateCoils(w);
  updateOrbs(w);
}

/**
 * For the test range: turn `owner` to face (x, y) and fire `def` from it there, as if it had
 * picked the weapon up (a lob lands on the spot).
 */
export function rangeArms(w: World, def: WeaponManifest, owner: Car, x: number, y: number): void {
  owner.h = Math.atan2(y - owner.y, x - owner.x);
  fireArms(w, owner, def, [x, y]);
  w.emit({ t: 'fire', car: owner.index, weapon: def.id });
}
