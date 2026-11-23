import type { LookModule } from '@demodogs/shared';
import { noise3 } from '../../../src/shapes';

/**
 * A crown of elm leaves: a tall vase of sprays, open in the middle, pale lime at the top going to
 * a deeper green underneath, with twigs showing through.
 */
const look: LookModule = {
  id: 'prop.elm-crown',
  look: {
    kind: 'prop',
    part: {
      w: 22,
      h: 22,
      layers: 14,
      smooth: true,
      fn: (x, y, z) => {
        const r = Math.hypot(x, y);
        const a = Math.atan2(y, x);
        // a vase: narrow at the foot, widest near the top
        const wide = 3.5 + z * 0.65 - Math.max(0, z - 10) * 1.4;
        const spray = Math.sin(a * 7 + z * 0.4) * 1.1;
        const rag = (noise3(x * 1.3, y * 1.3 + 4, z * 1.3) - 0.5) * 3;
        if (r > wide + spray + rag || z < 1) return null;
        // open in the middle low down
        if (r < wide - 4.5 && z < 9) return noise3(x * 3, y * 3, z) > 0.8 ? 'bark' : null;
        if (noise3(x * 2.6 + 2, y * 2.6, z * 2.6) > 0.72) return null;
        const tone = noise3(x * 0.8, y * 0.8 + 9, z * 0.8) + (z - 7) * 0.06;
        return tone > 0.62 ? 'lime2' : tone > 0.4 ? 'lime' : 'leaf2';
      },
    },
  },
};
export default look;
