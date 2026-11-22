import type { LookModule } from '@demodogs/shared';

/**
 * One leg of a gantry crane: a wheeled bogie on the quay, a square yellow column with hazard
 * stripes at the bottom and a ladder up one side, and a cap plate the gantry sits on.
 */
const look: LookModule = {
  id: 'prop.crane-leg',
  look: {
    kind: 'prop',
    part: {
      w: 8,
      h: 8,
      layers: 34,
      smooth: true,
      fn: (x, y, z) => {
        const ax = Math.abs(x);
        const ay = Math.abs(y);
        if (z < 2.2) {
          if (ax > 3.6 || ay > 2.4) return null;
          if (z < 1.3 && ay > 1.7) return Math.abs(ax - 2.2) < 1 ? 'tire' : null;
          return 'engine';
        }
        if (z > 30.5) return ax < 2.7 && ay < 2.7 ? (z > 33.4 ? 'band' : 'hazard') : null;
        // the ladder, up the +y face
        if (y > 1.6 && y < 2.3 && ax < 0.9 && z > 3)
          return ax > 0.65 || (z + 40) % 1.2 < 0.25 ? 'band' : null;
        if (ax > 1.6 || ay > 1.6) return null;
        if (z < 8) return (z + x * 0.8 + y * 0.8 + 40) % 2 < 1 ? 'black' : 'hazard';
        if ((z + 40) % 6 < 0.3) return 'amber';
        return 'hazard';
      },
    },
  },
};
export default look;
