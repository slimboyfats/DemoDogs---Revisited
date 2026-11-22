import type { LookModule } from '@demodogs/shared';
import { noise3 } from '../../../src/shapes';

/** A slim birch: a white trunk flecked with black and a tall, loose crown of small bright leaves. */
const look: LookModule = {
  id: 'prop.birch',
  look: {
    kind: 'prop',
    part: {
      w: 14,
      h: 14,
      layers: 24,
      smooth: true,
      fn: (x, y, z) => {
        const r = Math.hypot(x, y);
        if (z < 19 && r < 0.95 - z * 0.025)
          return noise3(x * 2 + 1, y * 2, z * 1.7) > 0.7 ? 'black' : 'birch';
        if (z < 8) return null;
        // a tall egg of leaves, loose all the way through
        const k = (z - 8) / 15.5;
        const reach = 5.2 * Math.sin(Math.PI * Math.min(1, k) ** 0.75);
        const rag = (noise3(x * 1.5, y * 1.5 + 6, z * 1.2) - 0.5) * 2.4;
        if (r > reach + rag) return null;
        if (noise3(x * 2.4, y * 2.4, z * 2.0 + 4) > 0.6) return null;
        const tone = noise3(x * 1.0 + 2, y * 1.0, z * 0.9) + k * 0.15;
        return tone > 0.6 ? 'lime2' : 'lime';
      },
    },
  },
};
export default look;
