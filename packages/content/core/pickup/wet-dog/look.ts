import type { LookModule } from '@demodogs/shared';

/**
 * A water tank lying across the car, hooped at both ends, with a sprinkler head on top. Drawn on
 * the bonnet of a car with a wet coat; the drips are the client's.
 */
const look: LookModule = {
  id: 'pickup.wet-dog',
  look: {
    kind: 'prop',
    part: {
      w: 4,
      h: 8,
      layers: 4,
      smooth: true,
      fn: (x, y, z) => {
        const ay = Math.abs(y);
        const r = Math.hypot(x, z - 1.6);
        // the sprinkler: a stub and a cap
        if (z > 2.9) return ay < 0.5 && Math.abs(x) < 0.5 ? (z > 3.4 ? 'chrome' : 'band') : null;
        if (r > 1.55 || ay > 3.5) return null;
        if (ay > 3.1 || (ay > 1.9 && ay < 2.3)) return 'band';
        // water behind glass: lighter where the light comes through the top
        return z > 2 ? 'glasshi' : 'glass';
      },
    },
  },
};
export default look;
