import type { LookModule } from '@demodogs/shared';
import { hash3, noise3 } from '../../../src/shapes';

/**
 * What is left of a piece of scrap that fell out of the sky: a lump of plate folded over on
 * itself and half buried, rusted and blackened, with a few seams still glowing.
 */
const look: LookModule = {
  id: 'prop.sky-scrap',
  look: {
    kind: 'prop',
    part: {
      w: 12,
      h: 12,
      layers: 7,
      smooth: true,
      fn: (x, y, z) => {
        const fold = noise3(x * 0.55 + 3, y * 0.55, z * 0.7) * 2.4;
        const d = Math.hypot(x / 5.4, y / 4.8, (z - 0.4) / 6.2);
        // jagged: plates stick out of the lump
        const spike = Math.floor(noise3(x * 1.1 + 9, y * 1.1, z * 1.3) * 3) * 0.3;
        if (d > 0.66 + (fold + spike) * 0.12) return null;
        // creases between the folded plates, some still hot
        if ((z * 1.1 + fold) % 1.5 < 0.3)
          return hash3(Math.floor(x), Math.floor(y), Math.floor(z)) < 0.3 ? 'glow' : 'under';
        const burnt = noise3(x * 0.8, y * 0.8 + 6, z * 0.6 + 2);
        if (burnt > 0.72) return 'black';
        if (hash3(Math.floor(x * 1.5), Math.floor(y * 1.5), Math.floor(z * 2)) < 0.05)
          return 'chrome';
        return burnt > 0.5 ? 'rust2' : 'rust';
      },
    },
  },
};
export default look;
