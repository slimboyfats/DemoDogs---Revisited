import type { LookModule, Part } from '@demodogs/shared';
import { rigLook } from '../../../src/rigs';

/** How tall the mast is: the dish turns on top of it. */
const MAST = 16;

/** A concrete plinth and a steel lattice mast, narrowing as it goes up. */
const mast: Part = {
  w: 9,
  h: 9,
  layers: MAST,
  smooth: true,
  fn: (x, y, z) => {
    const ax = Math.abs(x);
    const ay = Math.abs(y);
    if (z < 2) return ax < 4.2 && ay < 4.2 ? 'concrete' : null;
    const r = 2.6 - (1.2 * z) / MAST;
    if (ax > r || ay > r) return null;
    // four legs, and a brace round them every few layers
    if (ax > r - 0.7 && ay > r - 0.7) return 'chrome';
    if ((ax > r - 0.6 || ay > r - 0.6) && z % 3.5 < 0.7) return 'cage';
    return z > MAST - 1 ? 'cage' : null;
  },
};

/**
 * The dish: a white bowl open to the front, a strut out to the feed at the middle of it, and a
 * red lamp on its rim.
 */
const dish: Part = {
  w: 17,
  h: 17,
  layers: 16,
  smooth: true,
  fn: (x, y, z) => {
    // the turning head it stands on
    if (z < 2) return Math.hypot(x, y) < 1.8 ? 'cage' : null;
    const d = Math.hypot(x - 6.5, y, z - 8.5);
    if (x < 1.4 && d > 7.6 && d < 8.4 && z > 1.4)
      return x > 0.9 ? (z > 13.6 && Math.abs(y) < 0.8 ? 'tail' : 'chrome') : 'paintw';
    if (Math.abs(y) < 0.45 && Math.abs(z - 8.5) < 0.45 && x > -1.5 && x < 5) return 'cage';
    if (Math.hypot(x - 5.2, y, z - 8.5) < 0.9) return 'paintr';
    return null;
  },
};

/** A radar tower: a lattice mast with a big white dish on top that sweeps round and round. */
const look: LookModule = {
  id: 'prop.radar-tower',
  look: rigLook(mast, [{ part: dish, at: [0, 0, MAST - 1], move: { kind: 'turn', rate: 1.5 } }]),
};
export default look;
