import type { LookModule } from '@demodogs/shared';
import { rr } from '../../../src/shapes';

/** A thick steel plate with striped edges and a chrome rod rising out of it. */
const look: LookModule = {
  id: 'prop.crusher-plate',
  look: {
    kind: 'prop',
    part: {
      w: 24,
      h: 18,
      layers: 14,
      smooth: true,
      fn: (x, y, z) => {
        if (z < 4) {
          if (!rr(x, y, 11.4, 8.4, 1.2)) return null;
          if (z < 0.8 || !rr(x, y, 10.4, 7.4, 1)) return 'hazard';
          // a grid of bolts on top
          if (z > 3.4 && Math.abs(((x + 30) % 4) - 2) < 0.5 && Math.abs(((y + 30) % 4) - 2) < 0.5)
            return 'chrome';
          return 'band';
        }
        const r = Math.hypot(x, y);
        if (z < 5.5) return r < 4 ? 'engine' : null;
        return r < 2.2 ? 'chrome' : null;
      },
    },
  },
};
export default look;
