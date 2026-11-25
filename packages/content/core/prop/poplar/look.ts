import type { LookModule } from '@demodogs/shared';
import { band } from '../../../src/shapes';

const TONES = ['leaf', 'leaf2', 'leaf3'] as const;

/** A poplar, plain and bold: a short trunk under a tall smooth column of leaves, round at the top. */
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
        if (z < 5 && r < 1.2) return x + y > 0.5 ? 'bark2' : 'bark';
        if (z < 4) return null;
        const k = (z - 4) / 25.5;
        if (r > 4.6 * Math.min(1, k * 6) ** 0.5 * Math.sqrt(Math.max(0, 1 - k ** 2.6))) return null;
        return TONES[band(x, y, z, 4, 28)];
      },
    },
  },
};
export default look;
