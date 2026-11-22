import type { LookModule } from '@demodogs/shared';
import { CAR_CELL, rr } from '../../../src/shapes';

/** A wedge: a nose that starts at the road and climbs to a glass canopy, wide haunches behind. */
const look: LookModule = {
  id: 'car.wolfhound',
  look: {
    kind: 'car',
    body: {
      ...CAR_CELL,
      fn: (x, y, z) => {
        const a = 12.5;
        const b = 6;
        const ay = Math.abs(y);
        if (z === 0) return rr(x, y, a - 1.5, b - 1.2, 1) ? 'under' : null;
        // the wedge: each layer up starts further back from the nose
        const nose = a - Math.max(0, z - 1) * 2.6;
        if (z <= 3) {
          if (x > nose) return null;
          // waisted in the middle, wide at the wheels
          const waist = Math.abs(x) < 3 ? 0.8 : 0;
          if (!rr(x, y, a, b - waist, 2.6)) return null;
          if (z === 1 && x > a - 1.6 && ay > 2.6 && ay < 4.8) return 'light';
          if (z === 3 && x < -a + 1.2) return 'tail';
          if (z === 1 && x < -a + 1.2) return 'bumper';
          if (z === 3 && ay < 0.7 && x < -5) return 'trim';
          return 'paint';
        }
        if (z <= 5 && x > -4.5 && x < 4 - (z - 4) * 1.6 && rr(x, y, 4.6, 3.7 - (z - 4) * 0.5, 1.6))
          return z === 5 && Math.abs(x + 0.8) < 1.6 ? 'paint' : 'glass';
        return null;
      },
    },
    // an engine cover with an intake scoop
    top: {
      w: 7,
      h: 8,
      layers: 2,
      fn: (x, y, z) =>
        z === 0
          ? Math.abs(x) < 3.2 && Math.abs(y) < 3.4
            ? Math.abs(y) < 1.2
              ? 'under'
              : 'bumper'
            : null
          : Math.abs(x) < 2 && Math.abs(y) < 2
            ? 'trim'
            : null,
    },
  },
};
export default look;
