import type { LookModule } from '@demodogs/shared';
import { noise3 } from '../../../src/shapes';

/**
 * A cracked wall block: rough grey rock, dark cracks running through it, and a yellow cross
 * painted on its face to say a blast will bring it down.
 */
const look: LookModule = {
  id: 'prop.blast-wall',
  look: {
    kind: 'prop',
    part: {
      w: 19,
      h: 19,
      layers: 20,
      smooth: true,
      fn: (x, y, z) => {
        const rough = (noise3(x * 0.3, y * 0.3, z * 0.3) - 0.5) * 2.4;
        if (Math.max(Math.abs(x), Math.abs(y)) > 8.6 + rough * 0.5 || z > 19 + rough) return null;
        // the cracks: thin dark seams where the noise crosses a level
        const n = noise3(x * 0.22 + 4, y * 0.22, z * 0.22);
        if (Math.abs(n - 0.5) < 0.035) return 'black';
        // the painted cross, on every side
        const face = Math.abs(x) > Math.abs(y) ? y : x;
        const u = face;
        const v = z - 9.5;
        if (Math.abs(Math.abs(u) - Math.abs(v)) < 1.3 && Math.abs(u) < 6) return 'hazard';
        return noise3(x * 0.5, y * 0.5, z * 0.5 + 9) > 0.55 ? 'stone2' : 'stone';
      },
    },
  },
};
export default look;
