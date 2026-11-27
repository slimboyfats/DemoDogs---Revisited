import type { LookModule } from '@demodogs/shared';
import { grown } from '../../../src/shapes';

/**
 * A farm tractor, facing +x: big ridged wheels at the back and small ones in front, a green
 * bonnet with an exhaust stack, a red cab roof on four posts over the seat.
 */
const look: LookModule = {
  id: 'prop.tractor',
  look: {
    kind: 'prop',
    part: grown(
      {
        w: 16,
        h: 12,
        layers: 13,
        smooth: true,
        fn: (x, y, z) => {
          const ay = Math.abs(y);
          // the big back wheels, yellow hubs
          const rb = Math.hypot(x + 3, z - 3.6);
          if (ay > 3 && ay < 5.2 && rb < 3.6) return rb < 1.4 ? 'hazard' : 'tire';
          // the small front ones
          const rf = Math.hypot(x - 4.6, z - 2);
          if (ay > 2.4 && ay < 4 && rf < 2) return rf < 0.8 ? 'hazard' : 'tire';
          // the bonnet, a grille at its nose
          if (x > -0.6 && x < 6.6 && ay < 2.3 && z > 2.6 && z < 6.6)
            return x > 5.8 ? 'grille' : z > 5.8 ? 'tractor2' : 'tractor';
          // the exhaust stack
          if (Math.hypot(x - 3.4, y - 1.2) < 0.55 && z >= 6.6 && z < 10.4) return 'black';
          // the body under the seat, and the seat
          if (x > -5.6 && x <= -0.6 && ay < 2.9 && z > 2.6 && z < 5.4) return 'tractor';
          if (x > -4.6 && x < -2.4 && ay < 1.4 && z >= 5.4 && z < 7) return 'black';
          // the cab: four posts and a red roof
          if (x > -6 && x < 0 && ay < 3.4) {
            if (z > 10.6 && z < 12) return 'paintr';
            if (z >= 5.4 && z <= 10.6 && Math.abs(Math.abs(x + 3) - 2.7) < 0.4 && ay > 2.7)
              return 'black';
          }
          return null;
        },
      },
      1.5,
    ),
    materials: {
      tractor: ['#1f7a34', '#2ea044', '#6fd07c'],
      tractor2: ['#2a8c40', '#3cb556', '#86e092'],
    },
  },
};
export default look;
