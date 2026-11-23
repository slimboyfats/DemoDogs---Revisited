import type { LookModule } from '@demodogs/shared';

/** A crash barrier: wide at the foot, narrow at the top, half red and half white, bare at the foot. */
const look: LookModule = {
  id: 'prop.barrier',
  look: {
    kind: 'prop',
    part: {
      w: 9,
      h: 4,
      layers: 10,
      fn: (x, y, z) => {
        if (Math.abs(x) > 4.5 || Math.abs(y) > 1.9 - z * 0.12) return null;
        if (z < 1) return 'concrete';
        // a join at each end, and a lifting slot under the middle
        if (Math.abs(x) > 4.2) return 'stone';
        if (z < 1.8 && Math.abs(x) < 1) return 'black';
        if (z > 9) return x < 0 ? 'paintr2' : 'concrete';
        return x < 0 ? 'paintr' : 'paintw';
      },
    },
  },
};
export default look;
