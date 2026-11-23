import type { LookModule } from '@demodogs/shared';
import { noise3 } from '../../../src/shapes';

/** A tumbleweed: a hollow ball of dry twigs you can see through. */
const look: LookModule = {
  id: 'prop.tumbleweed',
  look: {
    kind: 'prop',
    part: {
      w: 8,
      h: 8,
      layers: 7,
      smooth: true,
      fn: (x, y, z) => {
        const r = Math.hypot(x, y, z - 3.3);
        if (r > 3.2 || r < 1.2) return null;
        const twig = noise3(x * 2.1, y * 2.1, z * 2.1);
        if (twig < 0.56) return null;
        return twig > 0.7 ? 'straw2' : 'dead';
      },
    },
  },
};
export default look;
