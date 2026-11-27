import type { LookModule } from '@demodogs/shared';
import { grown } from '../../../src/shapes';

/**
 * A tram car, facing +x: yellow below and cream above with a row of windows all round, a grey
 * roof with a pole up off it. Two or three run coupled.
 */
const look: LookModule = {
  id: 'prop.tram',
  look: {
    kind: 'prop',
    part: grown(
      {
        w: 16,
        h: 12,
        layers: 16,
        smooth: true,
        fn: (x, y, z) => {
          const ay = Math.abs(y);
          const ax = Math.abs(x);
          // the pole and its bow, up off the roof
          if (z >= 12.4) {
            if (Math.hypot(x, y) < 0.4 && z < 15) return 'black';
            return z >= 14.4 && z < 15.2 && ax < 0.5 && ay < 3 ? 'black' : null;
          }
          if (ax > 6.6 || ay > 4.4) return null;
          // skirts hide the wheels
          if (z < 1) return null;
          if (z < 2.2) return 'black';
          // the roof, rounded at its edges
          if (z > 11) return ay < 3.9 && ax < 6.2 ? 'concrete' : null;
          const wall = ay > 3.5 || ax > 5.8;
          if (!wall) return z < 3.2 ? 'wood' : null;
          // a lamp each end, low down
          if (ax > 5.8 && ay < 1 && z > 3 && z < 4.6) return 'glasshi';
          if (z < 6) return z > 5.2 ? 'paintr' : 'tram';
          // the windows: glass between cream pillars
          if (z < 9.4)
            return Math.abs(((x + 30) % 3.2) - 1.6) < 0.5 || (ax > 5.8 && ay > 2.6)
              ? 'cream'
              : 'glasshi';
          return 'cream';
        },
      },
      1.6,
    ),
    materials: {
      tram: ['#d99a00', '#ffc21a', '#ffe680'],
      cream: ['#d8cfae', '#f4ecd0', '#fffbea'],
    },
  },
};
export default look;
