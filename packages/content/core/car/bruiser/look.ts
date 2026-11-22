import type { LookModule, ShapeFn } from '@demodogs/shared';
import { CAR_CELL, rr } from '../../../src/shapes';

/** A van: a short bonnet and a tall box with a windscreen and side windows. */
export const bruiserBody: ShapeFn = (x, y, z) => {
  const a = 11.5;
  const b = 5.9;
  const ay = Math.abs(y);
  if (z === 0) return rr(x, y, a - 1.5, b - 1.2, 1) ? 'under' : null;
  if (z <= 3) {
    if (!rr(x, y, a, b, 1.6)) return null;
    if (z === 2 && x > a - 1.3 && ay > 2.6 && ay < 4.8) return 'light';
    if (z === 2 && x < -a + 1.2 && ay > 3.2) return 'tail';
    if (z <= 2 && Math.abs(x) > a - 1.1) return 'bumper';
    return 'paint';
  }
  if (!(x < a - 3.8 && rr(x + 1.6, y, a - 2.4, b - 0.2, 1.6))) return null;
  if (z >= 5 && z <= 7 && x > a - 5.6) return 'glass';
  if ((z === 6 || z === 7) && ay > 4.9 && x > -6 && x < 3) return 'glass';
  if (z === 8) return ay < 1.2 ? 'trim' : 'paint';
  return 'paint';
};

const look: LookModule = {
  id: 'car.bruiser',
  look: {
    kind: 'car',
    body: { ...CAR_CELL, fn: bruiserBody },
    // a roof rack
    top: {
      w: 10,
      h: 12,
      layers: 1,
      fn: (x, y) =>
        (Math.abs(x) > 3.6 || Math.abs(y) > 4.4 || Math.abs(x) < 0.6) &&
        Math.abs(x) < 4.6 &&
        Math.abs(y) < 5.2
          ? 'cage'
          : null,
    },
  },
};
export default look;
