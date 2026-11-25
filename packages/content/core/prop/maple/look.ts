import type { LookModule } from '@demodogs/shared';
import { band, puffs, type Puff } from '../../../src/shapes';

/** The crown: a wide ball of leaves with three more round it. */
const CROWN: readonly Puff[] = [
  [0, 0, 11.6, 6.6],
  [4.6, 0.8, 10.2, 4.6],
  [-4.4, 1.2, 10.2, 4.6],
  [-0.6, -4.4, 10.6, 4.4],
];
const TONES = ['maple2', 'maple', 'maple3'] as const;

/** A broad maple, plain and round: a stout trunk under a wide crown of rust, amber and yellow. */
const look: LookModule = {
  id: 'prop.maple',
  look: {
    kind: 'prop',
    part: {
      w: 22,
      h: 22,
      layers: 18,
      smooth: true,
      fn: (x, y, z) => {
        if (puffs(x, y, z, CROWN, 1.15) >= 0) return TONES[band(x, y, z, 6, 16.5)];
        if (z < 10 && Math.hypot(x, y) < 1.8 + Math.max(0, 1.4 - z) * 0.7)
          return x + y > 0.6 ? 'bark2' : 'bark';
        return null;
      },
    },
  },
};
export default look;
