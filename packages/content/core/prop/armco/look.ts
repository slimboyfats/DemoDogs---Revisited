import type { LookModule } from '@demodogs/shared';

/** A crash rail: a stout post at each end and a broad white rail with a red stripe between them. */
const look: LookModule = {
  id: 'prop.armco',
  look: {
    kind: 'prop',
    part: {
      w: 9,
      h: 3,
      layers: 6,
      fn: (x, y, z) => {
        const ax = Math.abs(x);
        if (ax > 4.5 || Math.abs(y) > 1.1) return null;
        // the posts
        if (ax > 3.3 && ax < 4.3 && Math.abs(y) < 0.5) return 'hub';
        // the rail, on the track side of the posts
        if (z < 2.2 || z > 5.6 || Math.abs(y) < 0.4) return null;
        return Math.abs(z - 3.9) < 0.6 ? 'tail' : 'picket';
      },
    },
  },
};
export default look;
