import type { LookModule } from '@demodogs/shared';
import { noise3 } from '../../../src/shapes';

/** A tall pine: a straight trunk and skirts of drooping boughs narrowing to a point. */
const look: LookModule = {
  id: 'prop.pine',
  look: {
    kind: 'prop',
    part: {
      w: 16,
      h: 16,
      layers: 22,
      smooth: true,
      fn: (x, y, z) => {
        const r = Math.hypot(x, y);
        if (z < 19 && r < 1.25 - z * 0.05) return 'bark';
        if (z < 3.2 || z > 21.6) return null;
        // five skirts, each wide at its hem and drawn in under the one above
        const tier = (z - 3.2) / 3.7;
        const f = tier - Math.floor(tier);
        const reach = (21.8 - z) * 0.3 + (1 - f) * 1.9;
        // the hem is ragged: boughs stick out all round
        const a = Math.atan2(y, x);
        const bough = Math.sin(a * 9 + Math.floor(tier) * 1.7) * 0.5 * (1 - f);
        const rag = (noise3(x * 1.6, y * 1.6, z * 1.2) - 0.5) * 1.2;
        if (r > reach + bough + rag) return null;
        const tone = noise3(x * 1.1 + 3, y * 1.1, z * 0.8) + f * 0.25;
        return tone > 0.78 ? 'pine3' : tone > 0.5 ? 'pine2' : 'pine';
      },
    },
  },
};
export default look;
