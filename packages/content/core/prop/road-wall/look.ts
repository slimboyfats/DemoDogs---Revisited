import type { LookModule } from '@demodogs/shared';

/** A thick cast wall for the edge of a raised road: pale, with a cap half red and half white. */
const look: LookModule = {
  id: 'prop.road-wall',
  look: {
    kind: 'prop',
    part: {
      w: 9,
      h: 4,
      layers: 11,
      fn: (x, y, z) => {
        if (Math.abs(x) > 4.5 || Math.abs(y) > 1.6) return null;
        if (z < 1) return 'stone';
        if (z > 8) return x < 0 ? 'paintr' : 'paintw';
        // a join at each end
        return Math.abs(x) > 4.2 ? 'stone' : 'concrete';
      },
    },
  },
};
export default look;
