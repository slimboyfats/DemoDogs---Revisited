import type { LookModule } from '@demodogs/shared';
import { noise3 } from '../../../src/shapes';

const LIMBS: readonly (readonly [number, number, number, number])[] = [
  [1, 0.2, 7, 9],
  [-0.7, 0.8, 9, 7],
  [-0.2, -1, 11, 6],
];

/** A dead tree: a leaning grey trunk that forks into three bare limbs. */
const look: LookModule = {
  id: 'prop.snag',
  look: {
    kind: 'prop',
    part: {
      w: 16,
      h: 16,
      layers: 20,
      smooth: true,
      fn: (x, y, z) => {
        const wood = () => (noise3(x * 2.5, y * 2.5, z * 0.5) > 0.6 ? 'dead' : 'rust2');
        // the trunk leans a little as it climbs
        if (z < 13 && Math.hypot(x - z * 0.05, y) < 1.4 - z * 0.06 + Math.max(0, 1.5 - z) * 0.7)
          return wood();
        // limbs: each leaves the trunk at its own height and runs out and up
        for (const [dx, dy, from, len] of LIMBS) {
          const t = (z - from) / len;
          if (t < 0 || t > 1) continue;
          const d = Math.hypot(dx, dy);
          const out = t * len * 0.75;
          if (Math.hypot(x - z * 0.05 - (dx / d) * out, y - (dy / d) * out) < 0.75 - t * 0.4)
            return wood();
        }
        return null;
      },
    },
  },
};
export default look;
