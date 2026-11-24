import type { LookModule } from '@demodogs/shared';

/**
 * One spiked hub: a toothed disc against the wheel and a steel spike standing out of it. +y points
 * away from the car; a car with spur rims has one on each wheel.
 */
const look: LookModule = {
  id: 'pickup.spur-rims',
  look: {
    kind: 'prop',
    part: {
      w: 5,
      h: 3,
      layers: 5,
      smooth: true,
      fn: (x, y, z) => {
        const zc = z - 2.5;
        const r = Math.hypot(x, zc);
        const t = y + 1.5;
        if (t < 0.7) {
          // the disc, with eight teeth round its rim
          const a = Math.atan2(zc, x) / (Math.PI * 2) + 0.5;
          const tooth = (((a * 8) % 1) + 1) % 1 < 0.5;
          if (r > (tooth ? 2.4 : 1.7)) return null;
          return r > 1.7 ? 'chrome' : r > 1.15 ? 'hazard' : 'chrome';
        }
        // the spike: a cone out to a point
        return r < 1.05 * (1 - (t - 0.7) / 2.3) + 0.1 ? 'chrome' : null;
      },
    },
  },
};
export default look;
