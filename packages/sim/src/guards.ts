import { DT, GUARD_KINDS, type GuardKind, type PickupManifest } from '@demodogs/shared';
import type { Car, Rocket } from './entities';
import { angDiff } from './math';
import type { World } from './world';

/**
 * Guards: countermeasures a car carries that act by themselves when what they guard against turns
 * up. Each is a pickup kind (GUARD_KINDS in the shared manifests says what each does); how long
 * it lasts, how many uses it has and how far it reaches come from the pickup's manifest. They
 * work the same for every driver, and nothing here names a content id.
 *
 * This module only keeps the numbers and answers the questions the rest of the sim asks ("is this
 * car hidden?", "does this round bounce?"); damage and blasts go through the caller's own rules.
 */
export interface Guard {
  def: PickupManifest;
  /** Uses left (counted guards), seconds left (timed ones), seconds until it can act again. */
  n: number;
  t: number;
  cd: number;
}
export type Guards = { [K in GuardKind]?: Guard | undefined };

/** A decoy on the ground: rockets that were coming for its owner chase it instead. */
export interface Decoy {
  id: number;
  x: number;
  y: number;
  /** The level it lies on, and how high it is bouncing above it. */
  z: number;
  up: number;
  vx: number;
  vy: number;
  vz: number;
  /** Seconds it still squeals. */
  t: number;
  owner: number;
}

/** How hard a rocket turns for a decoy (radians a second), and how close sets it off. */
const LURE_TURN = 9;
const LURE_HIT = 12;
/** How much of a shove gets through to a car whose claws are in, and how heavy it is to ram. */
const BRACED = 0.12;
const HEFT = 3;

export const isGuard = (kind: string): kind is GuardKind =>
  (GUARD_KINDS as readonly string[]).includes(kind);

/** The guard of this kind a running car has, if it has one. */
export function guard(c: Car, kind: GuardKind): Guard | undefined {
  return c.wrecked ? undefined : c.guards[kind];
}

/**
 * Fit pickup `got` to car `c`. Returns the words to float over it, or null when `got` is not a
 * guard. A second one of the same kind tops the first up: the longer time, the uses added.
 */
export function fitGuard(w: World, c: Car, got: PickupManifest): string | null {
  if (!isGuard(got.kind)) return null;
  const old = c.guards[got.kind];
  const g: Guard = {
    def: got,
    n: Math.min((old?.n ?? 0) + (got.charges ?? 0), (got.charges ?? 0) * 2),
    t: Math.max(old?.t ?? 0, got.seconds ?? 0),
    cd: 0,
  };
  c.guards[got.kind] = g;
  if (!old)
    w.emit({ t: 'guard', car: c.index, id: got.id, kind: got.kind, what: 'on', x: c.x, y: c.y });
  if (got.kind === 'earth') c.stall = 0;
  if (got.kind === 'soak') shakeOff(w, c);
  const name = got.meta.name.toUpperCase();
  return got.seconds !== undefined ? `${name} ${Math.round(g.t)}s` : `${name} x${g.n}`;
}

function unfit(w: World, c: Car, kind: GuardKind): void {
  const g = c.guards[kind];
  if (!g) return;
  c.guards[kind] = undefined;
  w.emit({ t: 'guard', car: c.index, id: g.def.id, kind, what: 'off', x: c.x, y: c.y });
}

/** Report a guard at work, and take one use off a counted one (it goes when the last is spent). */
function used(w: World, c: Car, g: Guard, spend: boolean, tx?: number, ty?: number): void {
  const kind = g.def.kind;
  w.emit(
    tx === undefined || ty === undefined
      ? { t: 'guard', car: c.index, id: g.def.id, kind, what: 'use', x: c.x, y: c.y }
      : { t: 'guard', car: c.index, id: g.def.id, kind, what: 'use', x: c.x, y: c.y, tx, ty },
  );
  if (!spend || g.def.charges === undefined) return;
  g.n--;
  if (g.n <= 0 && isGuard(kind)) unfit(w, c, kind);
}

// ---------------------------------------------------------------- questions the sim asks

/** jam: guns, seekers and lobbed shells cannot pick this car out. */
export function hidden(c: Car): boolean {
  return guard(c, 'jam') !== undefined;
}

/** soak: fire does not burn this car. */
export function fireproof(c: Car): boolean {
  return guard(c, 'soak') !== undefined;
}

/**
 * anchor: the share of a shove (a blast, a shockwave, a jet, a pull) that still moves this car.
 * Says so to the client when the car is being held against something, a few times a second.
 */
export function held(w: World, c: Car): number {
  const g = guard(c, 'anchor');
  if (!g) return 1;
  if (g.cd <= 0) {
    g.cd = 0.3;
    used(w, c, g, false);
  }
  return BRACED;
}

/** anchor: how many times its own weight a car with its claws in is to ram. */
export function heft(c: Car): number {
  return guard(c, 'anchor') ? HEFT : 1;
}

/** earth: a shock or a bolt meant for this car runs down its lead into the ground instead. */
export function earthed(w: World, c: Car): boolean {
  const g = guard(c, 'earth');
  if (!g) return false;
  if (g.cd <= 0) {
    g.cd = 0.15;
    const back = c.def.body.halfLength + 5;
    used(w, c, g, false, c.x - Math.cos(c.h) * back, c.y - Math.sin(c.h) * back);
  }
  return true;
}

/**
 * pads: a knock from something the car drove into, or that fell on it, at (x, y) costs nothing.
 * One crash is one pad, however many times it touches in the same moment.
 */
export function padded(w: World, c: Car, x: number, y: number): boolean {
  const g = guard(c, 'pads');
  if (!g) return false;
  if (g.cd > 0) return true;
  g.cd = 0.25;
  used(w, c, g, true, x, y);
  return true;
}

/**
 * mirror: a shot of `amount` from `shooter` that struck `target` at (x, y) goes back the way it
 * came and lands on the shooter instead. Returns the amount to hand the shooter (the caller deals
 * it, by its own rules), or 0 when the target has no mirror.
 */
export function bounced(w: World, target: Car, x: number, y: number, amount: number): number {
  const g = guard(target, 'mirror');
  if (!g) return 0;
  used(w, target, g, true, x, y);
  return amount;
}

/**
 * bond: `dealt` armour points are about to come off `c`. Part of it runs down the leash to the
 * nearest running rival in reach; returns [what `c` still takes, that rival, what it takes].
 */
export function shared(w: World, c: Car, dealt: number): [number, Car | null, number] {
  const g = guard(c, 'bond');
  if (!g || dealt <= 1) return [dealt, null, 0];
  let best: Car | null = null;
  let bd = g.def.reach ?? 90;
  for (const o of w.cars) {
    if (o === c || o.wrecked || o.invuln > 0 || Math.abs(o.deck - c.deck) > 12) continue;
    const d = Math.hypot(o.x - c.x, o.y - c.y);
    if (d < bd) {
      bd = d;
      best = o;
    }
  }
  if (!best) return [dealt, null, 0];
  const pass = dealt * Math.min(1, g.def.amount ?? 0.5);
  used(w, c, g, true, best.x, best.y);
  return [dealt - pass, best, pass];
}

/** The decoy a rocket is chasing, while it still squeals. */
export function lured(w: World, r: Rocket): Decoy | null {
  if (r.lure === undefined) return null;
  const d = w.decoys.find((d) => d.id === r.lure);
  if (d) return d;
  delete r.lure;
  return null;
}

/** How fast a lured rocket turns, and whether it has reached its decoy (which it then takes out). */
export function lureTurn(r: Rocket): number {
  return Math.max(r.def.homing ?? 0, LURE_TURN);
}
export function lureHit(d: Decoy, r: Rocket): boolean {
  if (Math.hypot(d.x - r.x, d.y - r.y) > LURE_HIT) return false;
  d.t = 0;
  return true;
}

// ---------------------------------------------------------------- once a tick

/** soak: a sticky bomb clinging to the car is shaken off and lies where it falls. */
function shakeOff(w: World, c: Car): void {
  for (const s of w.arms.stickies) {
    if (s.car !== c.index) continue;
    const a = c.h + Math.PI / 2;
    s.car = -1;
    s.x = c.x + Math.cos(a) * 14;
    s.y = c.y + Math.sin(a) * 14;
    s.passCd = 1;
    w.emit({ t: 'stick', car: -1, x: s.x, y: s.y });
  }
}

/** Is rocket r coming for car c: locked on to it, or pointed at it? */
function comingFor(r: Rocket, c: Car, reach: number): boolean {
  if (r.owner === c.index || Math.abs(c.deck - r.z) > 8) return false;
  const d = Math.hypot(c.x - r.x, c.y - r.y);
  if (d > reach) return false;
  return r.target === c.index || Math.abs(angDiff(Math.atan2(c.y - r.y, c.x - r.x), r.h)) < 0.5;
}

/** decoy: throw one out behind when a rocket comes for the car; every such rocket goes after it. */
function decoy(w: World, c: Car, g: Guard): void {
  if (g.cd > 0) return;
  const reach = g.def.reach ?? 130;
  const coming = w.rockets.filter((r) => r.lure === undefined && comingFor(r, c, reach));
  if (!coming.length) return;
  // out the back and off to one side, the other side each time
  const a = c.h + Math.PI + (g.n % 2 ? 0.8 : -0.8);
  const d: Decoy = {
    id: ++w.decoySeq,
    x: c.x - Math.cos(c.h) * (c.def.body.halfLength + 2),
    y: c.y - Math.sin(c.h) * (c.def.body.halfLength + 2),
    z: c.deck,
    up: 3,
    vx: c.vx * 0.45 + Math.cos(a) * 95,
    vy: c.vy * 0.45 + Math.sin(a) * 95,
    vz: 70,
    t: 2.4,
    owner: c.index,
  };
  w.decoys.push(d);
  for (const r of coming) {
    r.lure = d.id;
    delete r.target;
  }
  g.cd = 0.7;
  used(w, c, g, true, d.x, d.y);
}

/** flak: bring down the nearest rocket, shell or dart in reach that is not the car's own. */
function flak(w: World, c: Car, g: Guard): void {
  if (g.cd > 0) return;
  const reach = g.def.reach ?? 46;
  const A = w.arms;
  let bd = reach;
  let from: { x: number; y: number }[] | null = null;
  let at = -1;
  const look = (list: { x: number; y: number; owner: number }[], ok: (i: number) => boolean) => {
    for (let i = 0; i < list.length; i++) {
      const s = list[i]!;
      if (s.owner === c.index || !ok(i)) continue;
      const d = Math.hypot(s.x - c.x, s.y - c.y);
      if (d < bd) {
        bd = d;
        from = list;
        at = i;
      }
    }
  };
  look(w.rockets, (i) => Math.abs(w.rockets[i]!.z - c.deck) < 8);
  look(A.shells, () => true);
  look(A.stickies, (i) => A.stickies[i]!.flying);
  if (!from) return;
  const [s] = (from as { x: number; y: number }[]).splice(at, 1);
  g.cd = 0.18;
  used(w, c, g, true, s!.x, s!.y);
}

/** sweep: mines ahead are set off before the car reaches them, and spikes are flicked aside. */
function sweep(w: World, c: Car, g: Guard, pop: (x: number, y: number, power: number) => void) {
  const reach = g.def.reach ?? 34;
  const ahead = (x: number, y: number): boolean => {
    const d = Math.hypot(x - c.x, y - c.y);
    if (d > reach) return false;
    return d < 14 || Math.abs(angDiff(Math.atan2(y - c.y, x - c.x), c.h)) < 1.1;
  };
  for (let i = w.mines.length - 1; i >= 0; i--) {
    const m = w.mines[i]!;
    // its own mine it has only just laid is left alone
    if ((m.owner === c.index && m.t < 2) || Math.abs(m.z - c.deck) > 4 || !ahead(m.x, m.y))
      continue;
    w.mines.splice(i, 1);
    used(w, c, g, false, m.x, m.y);
    // tripped from a feeler's length: a pop, not the blast it was laid for
    pop(m.x, m.y, m.def.power * 0.3);
  }
  if (c.z - c.deck > 4) return;
  let flicked = false;
  for (let i = w.spikes.length - 1; i >= 0; i--) {
    const s = w.spikes[i]!;
    if ((s.owner === c.index && s.t < 1.5) || !ahead(s.x, s.y)) continue;
    w.spikes.splice(i, 1);
    if (!flicked) used(w, c, g, false, s.x, s.y);
    flicked = true;
  }
}

/** soak: fire the car comes within reach of is put out. */
function douse(w: World, c: Car, g: Guard): void {
  if (c.z - c.deck > 4 || c.deck > 1) return;
  const reach = g.def.reach ?? 18;
  for (let i = w.blazes.length - 1; i >= 0; i--) {
    const b = w.blazes[i]!;
    if (Math.hypot(b.x - c.x, b.y - c.y) > reach + b.r * 0.5) continue;
    w.blazes.splice(i, 1);
    w.emit({ t: 'quench', x: b.x, y: b.y, r: b.r });
  }
}

/**
 * Once a tick: clocks run down, a wreck loses everything, and the guards that watch for trouble
 * (decoys, flak, feelers, a wet coat) do their work. `pop` sets off a small blast (the caller's
 * `explode`, handed in so this module does not import the damage rules).
 */
export function updateGuards(w: World, pop: (x: number, y: number, power: number) => void): void {
  for (const c of w.cars) {
    for (const k of GUARD_KINDS) {
      const g = c.guards[k];
      if (!g) continue;
      if (c.wrecked) {
        unfit(w, c, k);
        continue;
      }
      g.cd -= DT;
      if (g.def.seconds !== undefined) {
        // nothing runs down on the grid
        if (w.phase === 'race') g.t -= DT;
        if (g.t <= 0) {
          unfit(w, c, k);
          continue;
        }
      }
      if (w.phase !== 'race') continue;
      if (k === 'decoy') decoy(w, c, g);
      else if (k === 'flak') flak(w, c, g);
      else if (k === 'sweep') sweep(w, c, g, pop);
      else if (k === 'soak') douse(w, c, g);
    }
  }
  for (let i = w.decoys.length - 1; i >= 0; i--) {
    const d = w.decoys[i]!;
    d.t -= DT;
    if (d.t <= 0) {
      w.decoys.splice(i, 1);
      w.emit({ t: 'pop', x: d.x, y: d.y });
      continue;
    }
    d.x += d.vx * DT;
    d.y += d.vy * DT;
    [d.x, d.y] = w.keepInside(d.x, d.y, 2);
    d.vz -= 400 * DT;
    d.up += d.vz * DT;
    if (d.up <= 0) {
      // it bounces, a little lower each time, and scrubs speed off on the ground
      d.up = 0;
      d.vz = d.vz < -30 ? -d.vz * 0.55 : 0;
      d.vx *= 0.8;
      d.vy *= 0.8;
    }
  }
}
