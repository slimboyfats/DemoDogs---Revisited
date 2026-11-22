import type { LookModule } from '@demodogs/shared';
import { CAR_CELL, rr } from '../../../src/shapes';

/** A small hatchback: a stubby bonnet and a tall boxy cabin that runs right to the tail. */
const look: LookModule = {
  id: 'car.terrier',
  look: {
    kind: 'car',
    body: {
      ...CAR_CELL,
      fn: (x, y, z) => {
        const a = 10;
        const b = 5.3;
        const ay = Math.abs(y);
        if (z === 0) return rr(x, y, a - 1.5, b - 1.2, 1) ? 'under' : null;
        if (z <= 3) {
          if (!rr(x, y, a, b, 2.2)) return null;
          if (z === 2 && x > a - 1.3 && ay > 2.2 && ay < 4.4) return 'light';
          if (z === 2 && x < -a + 1.3 && ay > 2.8) return 'tail';
          if (z <= 1 && Math.abs(x) > a - 1.1) return 'bumper';
          return 'paint';
        }
        if (z <= 6 && x < 3.4 && x > -a + 0.4 && rr(x + 3.2, y, 6.6, 4.7 - (z - 4) * 0.25, 1.3)) {
          if (z === 6) return 'paint';
          // pillars at the corners and between the doors, glass in between
          if (ay > 3.9 && Math.abs(x + 3) < 0.7) return 'paint';
          return x > 2.2 || x < -a + 1.6 || ay > 3.9 ? 'glass' : 'paint';
        }
        return null;
      },
    },
    // a roof rack: two rails and three bars
    top: {
      w: 9,
      h: 9,
      layers: 1,
      fn: (x, y) =>
        Math.abs(x) < 4 &&
        Math.abs(y) < 4 &&
        (Math.abs(Math.abs(y) - 3.3) < 0.6 || Math.abs(x % 3) < 0.6)
          ? 'bumper'
          : null,
    },
  },
};
export default look;
