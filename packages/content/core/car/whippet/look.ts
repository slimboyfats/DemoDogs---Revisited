import type { LookModule } from '@demodogs/shared';
import { CAR_CELL, rr } from '../../../src/shapes';

/** A muscle car: low and long, twin stripes over the bonnet and boot, a cabin set back. */
const look: LookModule = {
  id: 'car.whippet',
  look: {
    kind: 'car',
    body: {
      ...CAR_CELL,
      fn: (x, y, z) => {
        const a = 12;
        const b = 5.6;
        const ay = Math.abs(y);
        if (z === 0) return rr(x, y, a - 1.5, b - 1.2, 1) ? 'under' : null;
        if (z <= 3) {
          if (!rr(x, y, a - (z === 3 ? 0.6 : 0), b - (z === 3 ? 0.3 : 0), 2.4)) return null;
          if (z === 2 && x > a - 1.4 && ay > 2.6 && ay < 4.6) return 'light';
          if (z === 2 && x < -a + 1.4 && ay > 2.4) return 'tail';
          if (z <= 1 && Math.abs(x) > a - 1.1) return 'bumper';
          if (z === 3 && ay > 0.5 && ay < 1.7 && (x > 1.5 || x < -6.5)) return 'trim';
          return 'paint';
        }
        if (
          z <= 5 &&
          x > -6.5 &&
          x < 2 &&
          rr(x + 2.2, y, 4.3 - (z - 4) * 0.6, 4.6 - (z - 4) * 0.4, 1.4)
        ) {
          if (z === 5) return 'paint';
          return x > 0.6 || x < -5.4 || ay > 3.7 ? 'glass' : 'paint';
        }
        return null;
      },
    },
    // a rear wing on two posts
    top: {
      w: 3,
      h: 12,
      layers: 3,
      fn: (x, y, z) =>
        z < 2
          ? Math.abs(Math.abs(y) - 3.6) < 0.7 && Math.abs(x) < 0.8
            ? 'bumper'
            : null
          : Math.abs(y) < 5.4 && Math.abs(x) < 1.4
            ? 'trim'
            : null,
    },
  },
};
export default look;
