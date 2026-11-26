import { BODY_UP, type Part } from '@demodogs/shared';
import type { Car } from '@demodogs/sim';

/** Where a car's head lamps are in its look: art px ahead of its middle, out to each side, and up. */
export interface LampSpot {
  x: number;
  y: number;
  z: number;
}

/**
 * Finds the head lamps in a car body's look: the middle of the lens (the `light` material) on the
 * front half of one side. The beam is thrown from there, so it leaves the car where the lamp is
 * drawn whatever shape the car is. Null for a body with no lamps.
 */
export function findLamp(body: Part): LampSpot | null {
  const S = 0.25;
  let n = 0;
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (let z = S / 2; z < body.layers; z += S)
    for (let x = S / 2; x < body.w / 2; x += S)
      for (let y = S / 2; y < body.h / 2; y += S) {
        const m = body.fn(x, y, body.smooth ? z : Math.floor(z));
        if (!m || !m.startsWith('light')) continue;
        n++;
        sx += x;
        sy += y;
        sz += z;
      }
  return n ? { x: sx / n, y: sy / n, z: sz / n } : null;
}

export { BODY_UP };

/**
 * Car c's two head lamps in the world, left then right: (x, y) on the map and how high over the
 * ground under the car, as the car is drawn (its size, its nose up or down).
 */
export function lampsOf(c: Car, L: LampSpot): [[number, number, number], [number, number, number]] {
  const k = c.size;
  const cs = Math.cos(c.h) * k;
  const sn = Math.sin(c.h) * k;
  const z = c.z + (BODY_UP + L.z) * k + c.pitch * L.x * k;
  return [
    [c.x + cs * L.x + sn * L.y, c.y + sn * L.x - cs * L.y, z],
    [c.x + cs * L.x - sn * L.y, c.y + sn * L.x + cs * L.y, z],
  ];
}
