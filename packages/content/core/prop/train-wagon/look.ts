import type { LookModule } from '@demodogs/shared';
import { grown, hash3 } from '../../../src/shapes';

/**
 * An open goods wagon, facing +x: green plank sides on a black frame with four wheels, heaped
 * with logs.
 */
const look: LookModule = {
  id: 'prop.train-wagon',
  look: {
    kind: 'prop',
    part: grown(
      {
        w: 16,
        h: 12,
        layers: 11,
        smooth: true,
        fn: (x, y, z) => {
          const ay = Math.abs(y);
          if (z < 4.2 && ay > 3.3 && ay < 4.7)
            for (const wx of [-3.8, 3.8])
              if (Math.hypot(x - wx, z - 2.1) < 2.1)
                return Math.hypot(x - wx, z - 2.1) < 0.9 ? 'chrome' : 'tire';
          // the frame, a coupling out at each end
          if (z > 1.4 && z < 3.4 && Math.abs(x) < 6.6 && ay < 3.4) return 'black';
          if (z > 2 && z < 3 && Math.abs(x) < 7.8 && ay < 0.6) return 'chrome';
          if (Math.abs(x) > 6.4 || ay > 4.3 || z < 3.4) return null;
          // plank sides with a post at each corner and one mid way
          const side = ay > 3.5 || Math.abs(x) > 5.6;
          if (side && z < 7.6) {
            if (Math.abs(Math.abs(x) - 6) < 0.5 || (ay > 3.5 && Math.abs(x) < 0.5)) return 'black';
            return Math.floor(z / 1.4) % 2 ? 'wagon' : 'wagon2';
          }
          if (side) return null;
          // the load: logs lying along it, three across and two deep
          for (const [ly, lz] of [
            [-2.2, 5],
            [0, 5],
            [2.2, 5],
            [-1.1, 7],
            [1.1, 7],
          ] as const) {
            const d = Math.hypot(y - ly, z - lz);
            if (d < 1.15 && Math.abs(x) < 5.3)
              return Math.abs(x) > 4.7
                ? 'wood2'
                : hash3(Math.round(x), ly * 3, lz) > 0.5
                  ? 'bark'
                  : 'bark2';
          }
          return z < 4.2 ? 'wood' : null;
        },
      },
      1.6,
    ),
    materials: {
      wagon: ['#2f6b3a', '#3f8a4b', '#63b06e'],
      wagon2: ['#285c32', '#377a42', '#57a062'],
    },
  },
};
export default look;
