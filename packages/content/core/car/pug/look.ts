import type { LookModule } from '@demodogs/shared';
import { CAR_CELL, rr } from '../../../src/shapes';

/** A dune buggy: an open tub, seats, an engine on the back and a roll cage. */
const look: LookModule = {
  id: 'car.pug',
  look: {
    kind: 'car',
    body: {
      ...CAR_CELL,
      fn: (x, y, z) => {
        const a = 10.5;
        const b = 5.4;
        const ay = Math.abs(y);
        const ax = Math.abs(x);
        if (z === 0) return rr(x, y, a - 1.5, b - 1.2, 1) ? 'under' : null;
        if (!rr(x, y, a, b, 2)) return null;
        if (z === 1) return ax > a - 1 ? 'bumper' : 'paint';
        if (z === 2) {
          if (x > 5) return x > a - 1.2 && ay > 2 && ay < 4 ? 'light' : 'paint';
          if (ay > 4.2) return 'paint';
          if (x < -5) return 'engine';
          return x > -3 && x < 1 && ay < 3.6 ? 'seat' : null;
        }
        if (z === 3) {
          if (x > 5 && x < 8 && ay < 4) return 'paint';
          if (x < -5 && x > -a + 1 && ay < 3) return 'engine';
          return x > -3 && x < -1 && ay < 3.6 ? 'seat' : null;
        }
        if (z === 4 && x < -6 && x > -9 && ay < 2.2) return 'engine';
        const post = (Math.abs(x - 3) < 0.8 || Math.abs(x + 4) < 0.8) && Math.abs(ay - 4) < 0.8;
        if (z >= 3 && z <= 5 && post) return 'cage';
        if (
          z === 6 &&
          x > -4.8 &&
          x < 3.8 &&
          (Math.abs(ay - 4) < 0.8 || Math.abs(x - 3) < 0.8 || Math.abs(x + 4) < 0.8) &&
          ay < 4.8
        )
          return 'cage';
        return null;
      },
    },
    top: {
      w: 4,
      h: 8,
      layers: 1,
      fn: (x, y) => (Math.abs(x) < 1.6 && Math.abs(y) < 3.2 ? 'light' : null),
    },
  },
};
export default look;
