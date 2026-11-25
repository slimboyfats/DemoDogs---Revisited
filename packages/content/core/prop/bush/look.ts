import type { LookModule } from '@demodogs/shared';
import { band, hash3, puffs, type Puff } from '../../../src/shapes';

const MOUNDS: readonly Puff[] = [
  [0.4, 0.2, 2.6, 3.6],
  [-2.4, 1.2, 2.2, 2.7],
  [1.8, -2.2, 2.2, 2.6],
];
const TONES = ['leaf', 'leaf2', 'leaf3'] as const;

/** A low round bush: three smooth mounds of leaves with a few red berries. */
const look: LookModule = {
  id: 'prop.bush',
  look: {
    kind: 'prop',
    part: {
      w: 12,
      h: 12,
      layers: 7,
      smooth: true,
      fn: (x, y, z) => {
        const inside = puffs(x, y, z, MOUNDS, 1.15);
        if (inside < 0) return null;
        if (inside < 0.9 && z > 2 && hash3(Math.floor(x), Math.floor(y), Math.floor(z)) > 0.93)
          return 'tail';
        return TONES[band(x, y, z, 0.5, 5.5)];
      },
    },
  },
};
export default look;
