import type { LookModule } from '@demodogs/shared';

/**
 * One claw: an arm out from the sill and a hooked spike down into the ground, striped at the
 * knuckle. Drawn beside each wheel of a car that is dug in; +y points away from the car.
 */
const look: LookModule = {
  id: 'pickup.dig-in',
  look: {
    kind: 'prop',
    part: {
      w: 3,
      h: 4,
      layers: 4,
      smooth: true,
      fn: (x, y, z) => {
        const ax = Math.abs(x);
        // the arm, out from the body
        if (z > 2.5 && z < 3.4 && ax < 0.6 && y < 1.2) return 'band';
        if (y < 0.3 || y > 1.7) return null;
        // the spike: widest at the knuckle, a point in the dirt, hooked back under the car
        const cy = 1.25 - Math.max(0, 1.6 - z) * 0.28;
        if (z > 3.4 || Math.abs(y - cy) > 0.2 + z * 0.1 || ax > 0.2 + z * 0.14) return null;
        return z > 1.9 && z < 2.5 ? 'hazard' : 'chrome';
      },
    },
  },
};
export default look;
