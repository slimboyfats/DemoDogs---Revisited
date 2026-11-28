import { ADDON_KINDS, DT, type AddonKind, type PickupManifest } from '@demodogs/shared';
import { damage } from './damage';
import type { Car } from './entities';
import { angDiff } from './math';
import type { World } from './world';

/**
 * Add-ons: gear bolted to a car. Some are bought between races and come to the grid on the car,
 * some are found on the track; either way they are pickup manifests, fitted here, and they work
 * the same for every driver. What each kind reads from its manifest:
 *
 * - rims    spiked hubs. `bite`: armour ground off a car alongside, per second. `factor`: the share
 *           of a blow to the doors that still gets through.
 * - tank    a second boost bottle. `factor`: how many times longer the boost lasts (and how much
 *           faster it comes back).
 * - paws    knobbly tyres. `factor`: the share of what rough ground and slicks cost that is left.
 * - scoop   an air scoop. Within `radius` behind a rival going the same way, top speed is
 *           multiplied by `factor`.
 * - barrel  a second gun barrel. The gun fires `factor` times as fast; `amount` extra rounds.
 * - cage    a roll cage. `charges` blows that would wreck the car leave it with `amount` armour.
 * - magnet  for `seconds`, pickups within `radius` fly to the car.
 * - jet     a rocket bottle. For `seconds` the car is driven flat out at `factor` times its top
 *           speed, and rams `bite` times as hard.
 * - plates  `charges` slabs. A blow that lands on one is cut to `factor` of itself and the slab
 *           blows off: whoever struck it, within `radius`, takes `amount` and is thrown back.
 * - jaws    for `seconds`, `factor` of the armour the car knocks off a rival close by goes back
 *           on its own, and each point pays `amount` cash.
 */
export interface Fitted {
  def: PickupManifest;
  /** Seconds left (timed add-ons), charges left, and seconds until it can act again. */
  t: number;
  n: number;
  cd: number;
}
export type Fit = { [K in AddonKind]?: Fitted | undefined };

export const isAddon = (kind: string): kind is AddonKind =>
  (ADDON_KINDS as readonly string[]).includes(kind);

/** Add-ons that run out with time, and those a wreck knocks off for good. */
const TIMED: readonly AddonKind[] = ['magnet', 'jet', 'jaws'];
const LOST: readonly AddonKind[] = ['magnet', 'jet', 'jaws', 'plates'];

/** Seconds between two bites of spiked hubs. */
const GRIND_EVERY = 0.12;
/** A blow smaller than this does not set a plate off. */
const PLATE_MIN = 5;
/** How close a car has to be for its jaws to keep what it knocks off. */
const JAW_REACH = 44;

/**
 * Bolt add-on `got` onto car `c`. Returns the words to float over it, or null when `got` is not
 * an add-on. `quiet`: no event (a car that comes to the grid with it already fitted).
 */
export function fitAddon(w: World, c: Car, got: PickupManifest, quiet = false): string | null {
  if (!isAddon(got.kind)) return null;
  const old = c.fit[got.kind];
  const f: Fitted = { def: got, t: got.seconds ?? 0, n: got.charges ?? 0, cd: 0 };
  c.fit[got.kind] = f;
  if (got.kind === 'barrel' && !old) c.rounds += got.amount ?? 0;
  if (!quiet) w.emit({ t: 'addon', car: c.index, id: got.id, on: true, x: c.x, y: c.y });
  const name = got.meta.name.toUpperCase();
  if (f.t > 0) return `${name} ${Math.round(f.t)}s`;
  return f.n > 1 ? `${name} x${f.n}` : name;
}

function unfit(w: World, c: Car, kind: AddonKind, spent: boolean): void {
  const f = c.fit[kind];
  if (!f) return;
  c.fit[kind] = undefined;
  w.emit({ t: 'addon', car: c.index, id: f.def.id, on: false, x: c.x, y: c.y, spent });
}

/** Once a tick: clocks run down, and a wreck loses what was only strapped on. */
export function updateAddons(w: World): void {
  for (const c of w.cars) {
    if (c.wrecked) {
      for (const k of LOST) unfit(w, c, k, true);
      c.draft = false;
      continue;
    }
    for (const k of TIMED) {
      const f = c.fit[k];
      if (!f) continue;
      // nothing runs down on the grid
      if (w.phase !== 'countdown') f.t -= DT;
      if (f.t <= 0) unfit(w, c, k, false);
    }
    const r = c.fit.rims;
    if (r && r.cd > 0) r.cd -= DT;
  }
}

/** How many times the boost tank a car has (1: the one it was built with). */
export const tankOf = (c: Car): number => c.fit.tank?.def.factor ?? 1;

/** The share of what bad ground costs that this car still pays (1: all of it). */
export const roughOf = (c: Car): number => c.fit.paws?.def.factor ?? 1;

/** A lit rocket bottle's push: what it does to top speed, or 1. */
export const jetOf = (c: Car): number =>
  c.fit.jet && !c.wrecked ? (c.fit.jet.def.factor ?? 1.8) : 1;

/** How hard a car rams: its spikes, and a lit rocket behind it. */
export const ramOf = (c: Car): number => c.ram * (c.fit.jet ? (c.fit.jet.def.bite ?? 2) : 1);

/** How much faster a car's gun fires. */
export const barrelOf = (c: Car): number => c.fit.barrel?.def.factor ?? 1;

/** How far away a car picks things up from (art px). */
export const reachOf = (c: Car, plain: number): number =>
  c.fit.magnet ? Math.max(plain, c.fit.magnet.def.radius ?? 80) : plain;

/**
 * Is car `c` in a rival's wake: close behind a running car on its own level that is going its way?
 * Only a car with a scoop gains by it; the answer is its top speed's multiplier.
 */
export function draft(w: World, c: Car): number {
  const S = c.fit.scoop;
  c.draft = false;
  if (!S || c.wrecked || c.vf < 60) return 1;
  const reach = S.def.radius ?? 90;
  for (const o of w.cars) {
    if (o === c || o.wrecked || Math.abs(o.deck - c.deck) > 8) continue;
    const dx = o.x - c.x;
    const dy = o.y - c.y;
    if (Math.abs(dx) > reach || Math.abs(dy) > reach) continue;
    const d = Math.hypot(dx, dy);
    if (d > reach || d < 8) continue;
    if (Math.abs(angDiff(Math.atan2(dy, dx), c.h)) > 0.32) continue;
    if (Math.abs(angDiff(o.h, c.h)) > 0.7 || o.vf < 40) continue;
    c.draft = true;
    return S.def.factor ?? 1.1;
  }
  return 1;
}

/**
 * Two cars are touching at (px, py), which is `L` in a's own frame. If a has spiked hubs and the
 * touch is along its flank while it is moving, they grind a piece off b.
 */
export function grind(
  w: World,
  a: Car,
  b: Car,
  L: readonly [number, number],
  px: number,
  py: number,
): void {
  const r = a.fit.rims;
  if (!r || r.cd > 0 || a.wrecked || b.wrecked || !onFlank(a, L)) return;
  const speed = Math.hypot(a.vx, a.vy);
  if (speed < 25) return;
  r.cd = GRIND_EVERY;
  damage(w, b, (r.def.bite ?? 40) * GRIND_EVERY * (1 + speed / 120), a, px, py);
  w.emit({ t: 'grind', car: a.index, x: px, y: py });
}

/** Is the point `L` (in the car's frame) on its side, between the wheels? */
function onFlank(c: Car, L: readonly [number, number]): boolean {
  // (the car's frame is as big as the car is just now)
  return Math.abs(L[0]) / c.size < c.def.body.halfLength - 2 && Math.abs(L[1]) / c.size > 2;
}

/** What a car's own gear takes off a blow from another car that lands at `L` in its frame. */
export function gearGuard(c: Car, L: readonly [number, number]): number {
  let k = c.fit.jet ? 0.5 : 1;
  // (`L` here is already in the car's own size)
  if (c.fit.rims && onFlank(c, [L[0] * c.size, L[1] * c.size])) k *= c.fit.rims.def.factor ?? 0.6;
  return k;
}

let reacting = false;

/**
 * A blow of `dealt` armour points is about to land on `c` at (px, py). If it has a plate left and
 * the blow is big enough, the plate takes most of it and blows off at whoever struck. Returns what
 * gets through.
 */
export function plateOff(
  w: World,
  c: Car,
  dealt: number,
  by: Car | null,
  px: number,
  py: number,
): number {
  const P = c.fit.plates;
  if (!P || P.n <= 0 || dealt < PLATE_MIN) return dealt;
  P.n--;
  w.emit({ t: 'plate', car: c.index, id: P.def.id, x: px, y: py, left: P.n });
  if (by && by !== c && !by.wrecked && !reacting) {
    const dx = by.x - c.x;
    const dy = by.y - c.y;
    const d = Math.hypot(dx, dy);
    if (d < (P.def.radius ?? 30)) {
      // one plate answers one blow: the slab it throws does not set off the striker's own
      reacting = true;
      damage(w, by, P.def.amount ?? 12, c, px, py);
      reacting = false;
      const k = 80 / (d || 1);
      by.vx += dx * k;
      by.vy += dy * k;
    }
  }
  if (P.n <= 0) unfit(w, c, 'plates', true);
  return dealt * (P.def.factor ?? 0.4);
}

/**
 * Car `by` knocked `dealt` armour off `c` at (px, py). Jaws on `by`, if it is close enough to have
 * done it by hand, put part of that back on its own body and pay for the rest as scrap.
 */
export function chew(w: World, by: Car, c: Car, dealt: number, px: number, py: number): void {
  const J = by.fit.jaws;
  if (!J || Math.hypot(by.x - c.x, by.y - c.y) > JAW_REACH) return;
  const armor = Math.min(100 - by.hp, dealt * (J.def.factor ?? 0.5));
  by.hp += armor;
  const cash = w.cashless ? 0 : Math.round(dealt * (J.def.amount ?? 5));
  by.cash += cash;
  if (dealt > 2) w.emit({ t: 'chew', car: by.index, from: c.index, x: px, y: py, armor, cash });
}

/**
 * Car `c` has just been brought to nothing at (px, py). A roll cage with a charge left takes it
 * instead: the car is left battered but running, and the cage is torn off. True if it was saved.
 */
export function caged(w: World, c: Car): boolean {
  const G = c.fit.cage;
  if (!G || G.n <= 0) return false;
  G.n--;
  c.hp = G.def.amount ?? 20;
  c.invuln = 1.5;
  if (G.n <= 0) unfit(w, c, 'cage', true);
  return true;
}
