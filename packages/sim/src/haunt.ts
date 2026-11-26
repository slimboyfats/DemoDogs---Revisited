import { DT, NO_CONTROLS, type Controls } from '@demodogs/shared';
import type { Car } from './entities';
import type { World } from './world';

/**
 * A driver who is scrapped for good can come back as a ghost car: the wreck gets up and drives,
 * pale and half there. A ghost is still a wreck to every rule (it scores nothing, picks nothing
 * up, is not aimed at, cannot win), so all it can do is be in the way: a running car that meets
 * it is shoved, and never hurt.
 *
 * It is asked for with the driver's own controls, which is all an online race sends: the gas or
 * the brake brings the ghost up where the wreck lies, and one that is left alone for a while goes
 * away again (nothing there to see or hit) until it is asked for once more.
 */

/** Seconds a wreck lies before its ghost can get up. */
export const HAUNT_AFTER = 1.5;
/** Seconds a ghost that nobody is driving stays before it goes. */
export const HAUNT_REST = 4;
/** A ghost's weight, as a share of the car's own: it nudges, it does not bulldoze. */
export const HAUNT_HEFT = 0.6;

/** A scrapped driver's ghost: `up` while it is there, and how long it has been left alone. */
export interface Haunt {
  up: boolean;
  idle: number;
}

/** Is car c a ghost that is there just now? */
export function haunting(c: Car): boolean {
  return c.haunt !== undefined && c.haunt.up;
}

/** Is car c a ghost that has gone away: no wreck, nothing to see or hit? */
export function away(c: Car): boolean {
  return c.haunt !== undefined && !c.haunt.up;
}

/** Can car c have a ghost: a human's car, out for good, with a wreck to get up from? */
export function canHaunt(w: World, c: Car): boolean {
  return (
    c.wrecked &&
    c.isPlayer &&
    !c.ai &&
    !c.buried &&
    !w.sandbox &&
    (w.knockout || w.mode.respawnSeconds === undefined)
  );
}

/**
 * One tick of a wrecked human's car: what its driver's controls do to it. Gives back what the
 * ghost is driven with (nothing, when there is no ghost).
 */
export function haunt(w: World, c: Car, ctl: Controls): Controls {
  if (w.phase !== 'race' || !canHaunt(w, c)) return NO_CONTROLS;
  const asks = ctl.throttle > 0.1 || ctl.brake;
  let G = c.haunt;
  if (!G?.up) {
    if (!asks || c.wreckT < HAUNT_AFTER || (c.sunk ?? 0) > 0) return NO_CONTROLS;
    if (!G) {
      // the wreck gets up whole: the ghost is the car as it was
      G = c.haunt = { up: true, idle: 0 };
      c.has = { front: true, rear: true, top: true };
      c.lamps = 0;
      c.size = 1;
      c.squashT = 0;
    }
    G.up = true;
    G.idle = 0;
    c.vx = c.vy = c.spin = 0;
    w.emit({ t: 'haunt', car: c.index, on: true });
  }
  G.idle = asks || Math.abs(ctl.steer) > 0.1 ? 0 : G.idle + DT;
  if (G.idle > HAUNT_REST) {
    G.up = false;
    c.vx = c.vy = c.spin = 0;
    w.emit({ t: 'haunt', car: c.index, on: false });
    return NO_CONTROLS;
  }
  return { steer: ctl.steer, throttle: ctl.throttle, brake: ctl.brake, boost: false, fire: false };
}
