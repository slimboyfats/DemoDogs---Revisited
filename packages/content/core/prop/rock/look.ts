import type { LookModule } from '@demodogs/shared';
import { noise3 } from '../../../src/shapes';

/** A boulder: a lumpy dome with flat faces, darker bands of strata and moss in the hollows. */
const look: LookModule = {
  id: 'prop.rock',
  look: {
    kind: 'prop',
    part: {
      w: 14,
      h: 14,
      layers: 7,
      smooth: true,
      fn: (x, y, z) => {
        // cells of noise cut the dome into facets
        const lump = noise3(x * 0.45 + 2, y * 0.45, z * 0.5) * 2.6;
        const chip = Math.floor(noise3(x * 0.9, y * 0.9 + 5, z * 0.9) * 3) * 0.35;
        const d = Math.hypot(x / 6.3, y / 5.4, (z + 0.6) / 6.6);
        if (d > 0.72 + (lump + chip) * 0.11) return null;
        if (z > 3.4 && noise3(x * 0.7 + 8, y * 0.7, 1) > 0.66) return 'moss';
        return (((z * 1.3 + lump) | 0) & 1) === 0 ? 'stone' : 'stone2';
      },
    },
  },
};
export default look;
