import type { LookModule } from '@demodogs/shared';
import { hash3 } from '../../../src/shapes';

/** A square of pier decking: weathered planks across the pier with dark gaps between. */
const look: LookModule = {
  id: 'prop.pier-deck',
  look: {
    kind: 'prop',
    part: {
      w: 8,
      h: 8,
      layers: 1,
      smooth: true,
      fn: (x, y) => {
        if (Math.abs(x) > 4 || Math.abs(y) > 4) return null;
        const v = y + 40;
        if (v % 1.6 < 0.22) return 'black';
        const k = Math.floor(v / 1.6);
        if ((x + 40 + k * 2.7) % 8 < 0.2) return 'black';
        const h = hash3(k, Math.floor((x + 40 + k * 2.7) / 8), 3);
        return h < 0.35 ? 'wood2' : h < 0.75 ? 'wood' : 'dead';
      },
    },
  },
};
export default look;
