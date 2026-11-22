import type { LookModule } from '@demodogs/shared';
import { rr } from '../../../src/shapes';

/** A square steel column striped at the foot, a cylinder up its side and an amber lamp on top. */
const look: LookModule = {
  id: 'prop.crusher-post',
  look: {
    kind: 'prop',
    part: {
      w: 9,
      h: 9,
      layers: 32,
      smooth: true,
      fn: (x, y, z) => {
        if (z > 30) return Math.hypot(x, y) < 1.6 ? 'amber' : null;
        if (z > 29) return rr(x, y, 3.6, 3.6, 0.6) ? 'black' : null;
        if (rr(x, y, 3, 3, 0.5)) {
          if (z < 5) return Math.floor(z * 0.9 + x * 0.4) % 2 ? 'hazard' : 'black';
          return Math.abs(z - 15) < 0.5 ? 'band' : 'bumper';
        }
        // the hydraulic cylinder on the side facing the bed
        if (z > 6 && z < 27 && Math.hypot(x, y - 3.4) < 1.2) return z > 18 ? 'chrome' : 'engine';
        return null;
      },
    },
  },
};
export default look;
