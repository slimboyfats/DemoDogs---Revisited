import type { LookModule } from '@demodogs/shared';
import { noise3, puffs, type Puff } from '../../../src/shapes';
import { PEAK, rocky } from '../../../src/themes';

const LUMPS: readonly Puff[] = [
  [-0.6, 0.2, 1, 6],
  [3, -1, 0.4, 4.2],
  [-2.6, 2.4, 0, 3.6],
];

/** A boulder of cooled lava: black and blocky, with veins that still glow. */
const look: LookModule = {
  id: 'prop.lava-rock',
  look: {
    kind: 'prop',
    materials: PEAK,
    part: {
      w: 16,
      h: 16,
      layers: 8,
      smooth: true,
      fn: (x, y, z) => {
        const inside = puffs(x, y, z, LUMPS);
        if (inside < 0) return null;
        // the veins: thin sheets through the rock, seen where they reach its skin
        if (inside < 1.4 && Math.abs(noise3(x * 0.34, y * 0.34, z * 0.5 + 9) - 0.5) < 0.028)
          return z < 3 ? 'lava2' : 'lava';
        return z > 5.2 ? 'basalt3' : rocky(x, y, z, 'basalt', 'basalt2');
      },
    },
  },
};
export default look;
