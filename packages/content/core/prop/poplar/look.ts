import type { LookModule } from '@demodogs/shared';
import { noise3 } from '../../../src/shapes';

/** A poplar: a thin trunk inside a tall, tight column of leaves that tapers to a point. */
const look: LookModule = {
  id: 'prop.poplar',
  look: {
    kind: 'prop',
    part: {
      w: 12,
      h: 12,
      layers: 30,
      smooth: true,
      fn: (x, y, z) => {
        const r = Math.hypot(x, y);
        if (z < 24 && r < 1.05 - z * 0.03) return 'bark';
        if (z < 4) return null;
        const k = (z - 4) / 25.5;
        const reach = 4.3 * Math.min(1, k * 5) * (1 - k * k * 0.92);
        const a = Math.atan2(y, x);
        const rag =
          (noise3(x * 1.6, y * 1.6, z * 0.9 + 3) - 0.5) * 1.6 + Math.sin(a * 6 + z * 0.9) * 0.4;
        if (r > reach + rag) return null;
        const tone = noise3(x * 1.1, y * 1.1 + 8, z * 0.6) + k * 0.2;
        return tone > 0.72 ? 'leaf3' : tone > 0.48 ? 'leaf2' : 'leaf';
      },
    },
  },
};
export default look;
