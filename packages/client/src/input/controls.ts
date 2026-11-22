import type { Controls } from '@demodogs/shared';

/** What the player is pressing right now, from keys, the touch stick and the touch buttons. */
export interface RawInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  /** The touch stick: active while a finger is on it; mag 0-1, angle on screen (radians). */
  stick: { active: boolean; mag: number; angle: number };
  brake: boolean;
  boost: boolean;
  /** A fire press since the last read. */
  fire: boolean;
}

export const DEAD_ZONE = 0.18;

/**
 * Turn raw input into controls for the car with heading `heading`. Keys steer left and right
 * directly. The stick is point-to-steer: the car turns towards where the stick points, harder the
 * further off it is, and how far the stick is pushed is the throttle.
 */
export function toControls(i: RawInput, heading: number): Controls {
  const out: Controls = { steer: 0, throttle: 0, brake: i.brake, boost: i.boost, fire: i.fire };
  if (i.up || i.down || i.left || i.right) {
    out.throttle = i.up ? 1 : 0;
    out.brake = out.brake || i.down;
    out.steer = (i.right ? 1 : 0) - (i.left ? 1 : 0);
  } else if (i.stick.active && i.stick.mag > DEAD_ZONE) {
    let d = (i.stick.angle - heading) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    out.steer = Math.max(-1, Math.min(1, d * 2.4));
    out.throttle = Math.min(1, (i.stick.mag - DEAD_ZONE) / 0.6);
    // pointing back with the brake held: reverse straight
    if (Math.abs(d) > 2.4 && i.brake) out.steer = 0;
  }
  return out;
}
