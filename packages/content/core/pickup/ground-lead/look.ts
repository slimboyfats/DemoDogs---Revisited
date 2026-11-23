import type { LookModule } from '@demodogs/shared';

/**
 * A length of chain with a clip at one end and a lead weight at the other. Drawn trailing on the
 * ground behind a car with a ground lead; +x is the end clipped to the car.
 */
const look: LookModule = {
  id: 'pickup.ground-lead',
  look: {
    kind: 'prop',
    part: {
      w: 9,
      h: 2,
      layers: 2,
      smooth: true,
      fn: (x, y, z) => {
        const ay = Math.abs(y);
        if (x > 3.3) return ay < 0.7 && z < 1.7 ? 'band' : null;
        if (x < -3.2) return Math.hypot(x + 3.8, y) < 0.9 && z < 1.3 ? 'mine' : null;
        // links: one lying flat, the next on edge
        const k = (((x * 0.9) % 2) + 2) % 2;
        if (k < 1)
          return ay < 0.7 && z < 0.55 && !(ay < 0.25 && k > 0.25 && k < 0.75) ? 'chrome' : null;
        return ay < 0.3 && z < 1.05 ? 'hub' : null;
      },
    },
  },
};
export default look;
