import type { LookModule, ShapeFn } from '@demodogs/shared';
import { CAR_CELL, rr } from '../../../src/shapes';

/** A pickup: chassis, a cab with a glass ring and roof, and an open bed with low walls. */
export const muttBody: ShapeFn = (x, y, z) => {
  const a = 11.5;
  const b = 5.6;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  if (z === 0) return rr(x, y, a - 1.5, b - 1.2, 1) ? 'under' : null;
  if (z <= 3) {
    if (!rr(x, y, a, b, 2)) return null;
    if (z === 2 && x > a - 1.3 && ay > 2.3 && ay < 4.6) return 'light';
    if (z === 2 && x < -a + 1.3 && ay > 2.6) return 'tail';
    if (z <= 2 && ax > a - 1.1) return 'bumper';
    if (z === 3 && x > 3.5 && ay < 1.1) return 'trim';
    return 'paint';
  }
  if (x > -2.6 && x < 4.6 && rr(x - 1, y, 3.6, 4.6, 1.2)) {
    if (z === 6) return 'paint';
    if (z <= 5 && (x > 3.4 || ay > 3.6 || x < -1.6)) return 'glass';
    return z <= 5 ? 'paint' : null;
  }
  if (
    z === 4 &&
    x < -2.6 &&
    x > -a + 0.5 &&
    (ay > 4.4 || x < -a + 1.6) &&
    rr(x, y, a - 0.4, b - 0.2, 1.6)
  )
    return 'paint';
  return null;
};

const look: LookModule = {
  id: 'car.mutt',
  look: {
    kind: 'car',
    body: { ...CAR_CELL, fn: muttBody },
    // a light bar: amber ends, white middle
    top: {
      w: 3,
      h: 10,
      layers: 1,
      fn: (x, y) =>
        Math.abs(y) < 4.2 && Math.abs(x) < 1.2 ? (Math.abs(y) > 2.6 ? 'tail' : 'light') : null,
    },
  },
};
export default look;
