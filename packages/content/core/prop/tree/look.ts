import type { LookModule } from '@demodogs/shared';
import { band, puffs, type Puff } from '../../../src/shapes';

/** The crown: one big ball of leaves and two smaller ones against its sides. */
const CROWN: readonly Puff[] = [
  [0, 0, 12, 6.4],
  [3.6, 1.8, 10.2, 4.4],
  [-3.4, -1.6, 10.6, 4.4],
];
const TONES = ['leaf', 'leaf2', 'leaf3'] as const;

/** A broadleaf tree, plain and round: a stout trunk under a crown of three balls of leaves. */
const look: LookModule = {
  id: 'prop.tree',
  look: {
    kind: 'prop',
    part: {
      w: 20,
      h: 20,
      layers: 18,
      smooth: true,
      fn: (x, y, z) => {
        if (puffs(x, y, z, CROWN) >= 0) return TONES[band(x, y, z, 6, 17)];
        if (z < 10 && Math.hypot(x, y) < 1.7 + Math.max(0, 1.5 - z) * 0.6)
          return x + y > 0.6 ? 'bark2' : 'bark';
        return null;
      },
    },
  },
};
export default look;
