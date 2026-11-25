import { DT, type CarPart, type PickupManifest } from '@demodogs/shared';
import type { Car } from './entities';
import type { World } from './world';

/**
 * Defensive pickups: a shield bubble that soaks up blows until it is spent or runs out of time,
 * and a field welder that puts armour (and lost panels) back over a few seconds. The sim only
 * keeps the numbers and reports what happens; the client draws the bubble and the welding.
 */

/** Armour a car needs before the welder bolts a lost part back on (above where it fell off). */
const REFIT: readonly [CarPart, number][] = [
  ['top', 40],
  ['front', 60],
  ['rear', 80],
];

/**
 * Hand a car a defensive pickup. Returns the words to float over it, or null when `got` is not a
 * defensive kind (the caller deals with those).
 */
export function grantDefence(w: World, c: Car, got: PickupManifest): string | null {
  if (got.kind === 'shield') {
    const amount = got.amount ?? 40;
    // a second bubble tops the first one up rather than stacking on it
    c.shieldMax = Math.max(amount, c.shield);
    c.shield = c.shieldMax;
    c.shieldT = Math.max(c.shieldT, got.seconds ?? 8);
    w.emit({ t: 'shield', car: c.index, what: 'up', x: c.x, y: c.y, amount: 0, left: 1 });
    return `${got.meta.name.toUpperCase()} ${Math.round(c.shield)}`;
  }
  if (got.kind === 'weld') {
    const amount = got.amount ?? 50;
    const seconds = got.seconds ?? 4;
    // what is still to come from a welder already at work is added on, over the longer of the two
    const left = c.weldRate * c.weldT + amount;
    c.weldT = Math.max(c.weldT, seconds);
    c.weldRate = left / c.weldT;
    w.emit({ t: 'weld', car: c.index, what: 'start' });
    return `${got.meta.name.toUpperCase()} +${amount}`;
  }
  return null;
}

/**
 * A blow of `dealt` armour points about to land on `c` at (px, py): the shield takes what it can.
 * Returns what gets through.
 */
export function absorb(w: World, c: Car, dealt: number, px: number, py: number): number {
  if (c.shield <= 0) return dealt;
  const soaked = Math.min(c.shield, dealt);
  c.shield -= soaked;
  if (c.shield <= 1e-6) {
    stopShield(w, c, 'pop', px, py, soaked);
    // what was too much for the bubble goes on through, softened by the burst
    return (dealt - soaked) * 0.5;
  }
  w.emit({
    t: 'shield',
    car: c.index,
    what: 'hit',
    x: px,
    y: py,
    amount: soaked,
    left: c.shield / c.shieldMax,
  });
  return 0;
}

function stopShield(
  w: World,
  c: Car,
  what: 'pop' | 'fade',
  x: number,
  y: number,
  amount: number,
): void {
  c.shield = 0;
  c.shieldT = 0;
  w.emit({ t: 'shield', car: c.index, what, x, y, amount, left: 0 });
}

/** Once a tick: shields run down, welders weld. */
export function updateDefence(w: World): void {
  for (const c of w.cars) {
    if (c.wrecked) {
      // a wreck loses whatever it had going; the tow truck brings back a whole car anyway
      if (c.shield > 0) stopShield(w, c, 'pop', c.x, c.y, 0);
      c.weldT = 0;
      c.weldRate = 0;
      continue;
    }
    if (c.shield > 0) {
      c.shieldT -= DT;
      if (c.shieldT <= 0) stopShield(w, c, 'fade', c.x, c.y, 0);
    }
    if (c.weldT > 0) {
      const dt = Math.min(DT, c.weldT);
      c.hp = Math.min(100, c.hp + c.weldRate * dt);
      c.weldT -= dt;
      for (const [part, need] of REFIT)
        if (!c.has[part] && c.hp >= need) {
          c.has[part] = true;
          // (a new bumper comes with new lamps)
          if (part === 'front') c.lamps &= ~3;
          if (part === 'rear') c.lamps &= ~12;
          w.emit({ t: 'weld', car: c.index, what: 'part', part });
        }
      if (c.weldT <= 1e-9 || c.hp >= 100) {
        c.weldT = 0;
        c.weldRate = 0;
        w.emit({ t: 'weld', car: c.index, what: 'done' });
      }
    }
  }
}
