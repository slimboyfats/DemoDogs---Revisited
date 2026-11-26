import { type LookModule, type ShapeFn } from '@demodogs/shared';
import { carBody } from '../../../src/carshape';
import { CAR_CELL, hash3 } from '../../../src/shapes';

/** Is this point of the skin inside one of the spots? One to a cell of a grid, each its own size and place in it. */
function spot(x: number, y: number, z: number): boolean {
  const G = 2.5;
  const i = Math.floor(x / G);
  const j = Math.floor(y / G);
  const k = Math.floor(z / G);
  const at = (n: number, c: number) =>
    (c + 0.3 + 0.4 * hash3(i + n * 17, j - n * 5, k + n * 9)) * G;
  const r = G * (0.2 + 0.15 * hash3(i + 3, j + 11, k + 7));
  return Math.hypot(x - at(1, i), y - at(2, j), z - at(3, k)) < r;
}

/** A round-backed coupe: one curve from nose to tail, pale paint with black spots all over it. */
export const dalmatianBody: ShapeFn = carBody({
  a: 11,
  b: 5.7,
  r: 3.2,
  taper: [0.8, 1.0],
  deck: [
    [-11, 3.2],
    [-8.4, 4.1],
    [-4, 4.8],
    [2.8, 4.8],
    [6, 4.5],
    [11, 3.2],
  ],
  round: 1.6,
  crown: 0.6,
  arches: [
    { x: 6.9, r: 3.3 },
    { x: -6.9, r: 3.3 },
  ],
  cabin: { x0: -7.2, x1: 3.4, roof: 7.3, inset: 0.9, lean: 1.0, rakeF: 2.8, rakeR: 3.8 },
  head: [1.8, 4.4, 2.3, 3.4],
  tail: [2.2, 4.6, 2.3, 3.2],
  grille: 1.4,
  gaps: [4.2, -1.9],
  exhausts: [2.4, -2.4],
  // running boards between the wings
  extra: (x, y, z) =>
    Math.abs(x) < 3.4 && Math.abs(Math.abs(y) - 5.75) < 0.4 && z > 1.0 && z < 1.4
      ? 'chrome'
      : undefined,
  paint: (x, y, z, skin) => (skin < 0.45 && spot(x, y, z) ? 'black' : undefined),
});

const look: LookModule = {
  id: 'car.dalmatian',
  look: {
    kind: 'car',
    body: { ...CAR_CELL, smooth: true, fn: dalmatianBody },
    // a firehouse beacon: a red dome on a chrome foot
    top: {
      w: 3,
      h: 3,
      layers: 3,
      smooth: true,
      fn: (x, y, z) => {
        const r = Math.hypot(x, y);
        if (z < 0.5) return r < 1.35 ? 'chrome' : null;
        return Math.hypot(r, (z - 0.5) * 0.75) < 1.15 ? 'tail' : null;
      },
    },
  },
};
export default look;
