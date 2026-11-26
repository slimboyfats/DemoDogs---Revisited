import { withFinish, type LookModule, type ShapeFn } from '@demodogs/shared';
import { carBody, sdRR } from '../../../src/carshape';
import { CAR_CELL, noise3 } from '../../../src/shapes';

/** The tipper: from here to here along the truck, this wide, its floor and its rim this high. */
const BED: readonly [number, number] = [-12.2, 1.3];
const WIDE = 5.9;
const FLOOR = 4.6;
const RIM = 7.2;
const WALL = 0.65;

/** What a point of the load is: rusty panels, tyres and the odd bright bit. */
function scrap(x: number, y: number, z: number): string {
  const n = noise3(x * 0.8 + 3.7, y * 0.8 + 8.2, z * 0.9 + 1.9);
  if (n < 0.3) return 'rust';
  if (n < 0.5) return 'rust2';
  if (n < 0.62) return 'bumper';
  if (n < 0.74) return 'tire';
  return n < 0.84 ? 'paintr2' : 'chrome';
}

/** A six-wheel scrap hauler: a flat-faced cab over the engine, two stacks, and a tipper heaped with junk. */
export const mastiffBody: ShapeFn = carBody({
  a: 12.5,
  b: 6.2,
  r: 1.4,
  taper: [0.2, 0],
  deck: [
    [-12.5, 4.8],
    [11.2, 4.8],
    [12.5, 4.5],
  ],
  round: 1.0,
  crown: 0.3,
  arches: [
    { x: 8.4, r: 3.1 },
    { x: -3.0, r: 3.1 },
    { x: -9.0, r: 3.1 },
  ],
  cabin: { x0: 2.7, x1: 11.5, roof: 8.6, inset: 0.35, lean: 0.4, rakeF: 1.7, rakeR: 0.3 },
  head: [2.9, 5.3, 2.2, 3.3],
  tail: [3.9, 5.6, 2.4, 3.5],
  grille: 2.7,
  gaps: [2.2],
  exhausts: [],
  bare: { aerial: true },
  extra: (x, y, z) => {
    const ay = Math.abs(y);
    // a stack each side between the cab and the tipper, bores open at the top
    const pr = Math.hypot(x - 2.0, ay - 5.2);
    if (pr < 0.5 && z > 4.4) return z > 8.5 && pr < 0.26 ? 'under' : 'chrome';
    if (z <= FLOOR || x < BED[0] || x > BED[1]) return undefined;
    const len = (BED[1] - BED[0]) / 2;
    const d = -sdRR(x - (BED[0] + BED[1]) / 2, y, len, WIDE, 0.9);
    if (d <= 0) return null;
    if (d < WALL) {
      if (z > RIM) return null;
      if (z > RIM - 0.45) return 'bumper';
      // the tailboard in warning stripes, the sides ribbed
      if (x < BED[0] + WALL) return (((y + z) * 0.8 + 40) | 0) & 1 ? 'hazard' : 'black';
      if (ay > WIDE - WALL && d < 0.3) {
        const k = (((x - BED[0]) % 2.7) + 2.7) % 2.7;
        if (k < 0.5) return 'paint2';
      }
      return 'paint';
    }
    // the load: a heap, highest in the middle
    if (z < FLOOR + 0.4) return 'under';
    const heap =
      FLOOR +
      0.9 +
      4.2 * noise3(x * 0.55 + 1.3, y * 0.55 + 6.1, 2.4) * Math.min(1, (d - WALL) / 2.2);
    return z < heap ? scrap(x, y, z) : null;
  },
  paint: (x, _y, z, skin) =>
    skin < 0.45 && x > 2.4 && Math.abs(z - 4.2) < 0.22 ? 'trim' : undefined,
});

const look: LookModule = {
  id: 'car.mastiff',
  look: {
    kind: 'car',
    // works paint: flat on the tipper, with its rim worn back to bare metal
    body: withFinish({ ...CAR_CELL, smooth: true, fn: mastiffBody }, (x, _y, z, m) =>
      x < BED[1] && z > FLOOR ? (m === 'paint' || m === 'paint2' ? 'matte' : null) : null,
    ),
    // a beacon on the cab roof between a pair of air horns
    top: {
      w: 5,
      h: 9,
      layers: 3,
      smooth: true,
      fn: (x, y, z) => {
        const ay = Math.abs(y);
        // the horns: trumpets that flare towards the front
        const hr = Math.hypot(ay - 2.7, z - 0.9);
        if (x > -2 && x < 2.1 && hr < 0.4 + Math.max(0, x - 0.6) * 0.32)
          return x > 1.75 && hr < 0.55 ? 'under' : 'chrome';
        const r = Math.hypot(x, y);
        if (z < 0.5) return r < 1.3 ? 'chrome' : null;
        return Math.hypot(r, (z - 0.5) * 0.65) < 1.1 ? 'light' : null;
      },
    },
  },
};
export default look;
