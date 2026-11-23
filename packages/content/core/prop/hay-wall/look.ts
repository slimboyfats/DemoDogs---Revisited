import type { LookModule } from '@demodogs/shared';
import { hash3 } from '../../../src/shapes';

/** Two square straw bales, one on the other, tied with twine. */
const look: LookModule = {
  id: 'prop.hay-wall',
  look: {
    kind: 'prop',
    part: {
      w: 6,
      h: 9,
      layers: 6,
      smooth: true,
      fn: (x, y, z) => {
        if (Math.abs(x) > 2.4 || Math.abs(y) > 4 || z > 5.2) return null;
        // the gap between the two bales
        if (Math.abs(z - 2.6) < 0.2) return 'straw2';
        if (
          Math.abs(Math.abs(y) - 2) < 0.25 &&
          (Math.abs(x) > 2.1 || z > 4.9 || Math.abs(z - 2.3) < 0.3)
        )
          return 'rust2';
        return hash3(Math.round(x * 2), Math.round(y * 2.5), Math.round(z * 2)) > 0.62
          ? 'straw2'
          : 'straw';
      },
    },
  },
};
export default look;
