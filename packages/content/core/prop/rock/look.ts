import type { LookModule } from '@demodogs/shared';
import { band, puffs, type Puff } from '../../../src/shapes';

const LUMPS: readonly Puff[] = [
  [-0.8, 0.2, 0.4, 5.2],
  [2.6, -0.6, 0, 3.8],
];

/** A boulder, plain and round: a big smooth lump with a smaller one against it, pale on top. */
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
        if (puffs(x, y, z, LUMPS) < 0) return null;
        return band(x, y, z, 0, 5.4) > 0 ? 'stone' : 'stone2';
      },
    },
  },
};
export default look;
