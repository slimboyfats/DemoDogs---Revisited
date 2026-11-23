import type { LookModule } from '@demodogs/shared';
import { DESERT, strata } from '../../../src/desert';
import { noise3 } from '../../../src/shapes';

/**
 * A buttress of canyon sandstone: wide at the foot, stepping in at hard bands, cut into flutes
 * by the weather, streaked dark with desert varnish and capped with pale rock.
 */
const look: LookModule = {
  id: 'prop.sandstone-cliff',
  look: {
    kind: 'prop',
    materials: DESERT,
    part: {
      w: 20,
      h: 20,
      layers: 26,
      smooth: true,
      fn: (x, y, z) => {
        const a = Math.atan2(y, x);
        // hard bands stick out as ledges, soft ones are worn back
        const band = Math.floor(z / 4.3);
        const ledge = z % 4.3 < 0.9 ? 0.7 : 0;
        const flute = Math.sin(a * 7 + band * 1.3) * 0.55;
        const lump = noise3(x * 0.35, y * 0.35, z * 0.18) * 2.4;
        const r = 9.2 - z * 0.13 + ledge + flute + lump - (band & 1) * 0.5;
        const d = Math.hypot(x, y);
        if (d > r || z > 24.5 + noise3(x * 0.4, y * 0.4, 3) * 1.5) return null;
        if (z > 23.3) return 'sand3';
        // dark streaks run down the face from the lips of ledges
        if (d > r - 0.9 && noise3(Math.round(a * 9) * 1.7, 1, z * 0.05) > 0.68) return 'varnish';
        return strata(x, y, z);
      },
    },
  },
};
export default look;
