import type { LookModule } from '@demodogs/shared';
import { hash3 } from '../../../src/shapes';

/** Three toadstools: white stalks, red caps with white spots. */
const look: LookModule = {
  id: 'prop.mushrooms',
  look: {
    kind: 'prop',
    part: {
      w: 7,
      h: 7,
      layers: 4,
      smooth: true,
      fn: (x, y, z) => {
        for (const [cx, cy, top, cap] of [
          [-1.2, -0.8, 2.6, 1.5],
          [1.3, 0.2, 3.3, 1.8],
          [-0.2, 1.6, 2, 1.1],
        ] as const) {
          const d = Math.hypot(x - cx, y - cy);
          if (z < top - 0.9) {
            if (d < 0.4) return 'paintw';
          } else if (z < top && d < cap * (1 - (z - top + 0.9) * 0.45))
            return hash3(Math.round(x * 2), Math.round(y * 2), 1) > 0.8 ? 'paintw' : 'petalr';
        }
        return null;
      },
    },
  },
};
export default look;
