import type { LookModule } from '@demodogs/shared';
import { noise3 } from '../../../src/shapes';
import { BAY } from '../../../src/themes';

/**
 * A length of dirt path, +x along it: packed earth with a ragged edge either side, a paler crown
 * down the middle and two wheel ruts. Its ends are square so that lengths join.
 */
const look: LookModule = {
  id: 'prop.dirt-track',
  look: {
    kind: 'prop',
    materials: BAY,
    part: {
      w: 44,
      h: 60,
      layers: 1,
      smooth: true,
      fn: (x, y) => {
        const edge = 27.5 + (noise3(x * 0.16, 3, 1) - 0.5) * 5;
        const ay = Math.abs(y);
        if (ay > edge) return null;
        if (ay > edge - 1.6) return 'path2';
        // two faint ruts, broken here and there
        if (Math.abs(ay - 11) < 1.3 && noise3(x * 0.12, y * 0.3, 7) > 0.42) return 'path2';
        return 'path';
      },
    },
  },
};
export default look;
