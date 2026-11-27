import type { LookModule } from '@demodogs/shared';
import { grown } from '../../../src/shapes';

/**
 * A little steam locomotive, facing +x: a red boiler with brass bands and a dome, a black funnel
 * up front, a cab with windows at the back, on a black frame with six wheels.
 */
const look: LookModule = {
  id: 'prop.steam-engine',
  look: {
    kind: 'prop',
    part: grown(
      {
        w: 18,
        h: 12,
        layers: 15,
        smooth: true,
        fn: (x, y, z) => {
          const ay = Math.abs(y);
          // wheels: three a side, the rods between them
          if (z < 4.2 && ay > 3.3 && ay < 4.7)
            for (const wx of [-4.6, 0, 4.6])
              if (Math.hypot(x - wx, z - 2.1) < 2.1)
                return Math.hypot(x - wx, z - 2.1) < 0.9 ? 'chrome' : 'tire';
          // the frame, and a red buffer beam at each end
          if (z > 1.4 && z < 3.4 && Math.abs(x) < 7.8 && ay < 3.4)
            return Math.abs(x) > 7 ? 'paintr2' : 'black';
          // a cowcatcher out in front
          if (x > 7.6 && x < 8.8 && ay < 3.2 - (8.8 - x) * 0 && z > 0.6 && z < 2.6) return 'chrome';
          // the cab: walls, a window band, a black roof that overhangs
          if (x < -2.4 && x > -7.6) {
            if (z > 10.6 && z < 12 && ay < 5) return 'black';
            if (z >= 3.4 && z <= 10.6 && ay < 4.3) {
              const wall = ay > 3.5 || x < -6.8 || x > -3.2;
              if (!wall) return z < 5 ? 'wood' : null;
              return z > 6.8 && z < 9.4 && (ay < 2.6 || (x > -6.2 && x < -3.8))
                ? 'glasshi'
                : 'paintr';
            }
          }
          // the boiler: a barrel along the engine, brass bands round it, a black smokebox in front
          const b = Math.hypot(y, z - 6.6);
          if (x >= -2.6 && x < 7.4 && b < 3.3) {
            if (x > 5.6) return 'black';
            return Math.abs(x - 1.4) < 0.5 || Math.abs(x - 4.4) < 0.5 ? 'brass' : 'paintr';
          }
          // the funnel, flared at the top
          const f = Math.hypot(x - 6.2, y);
          if (z >= 9 && z < 14.4 && f < (z > 12.8 ? 1.9 : 1.2)) return 'black';
          // a brass dome, and a lamp on the smokebox door
          if (Math.hypot(x - 2.9, y, (z - 9.6) * 0.9) < 1.7) return 'brass';
          if (x > 7.2 && x < 8.1 && Math.hypot(y, z - 7) < 1) return 'glasshi';
          return null;
        },
      },
      1.6,
    ),
    materials: { brass: ['#a8781c', '#e2b23c', '#ffe89a'] },
  },
};
export default look;
