import type { LookModule } from '@demodogs/shared';

/** A crash rail: a post at each end and a ribbed steel rail between them, rust at the feet. */
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
        if (ax > 3.4 && ax < 4.2 && Math.abs(y) < 0.5) return z < 1.2 ? 'rust' : 'engine';
        // the rail: two ribs with a dark groove between them, on the track side of the posts
        if (z < 2.2 || z > 5.6 || Math.abs(y) < 0.4) return null;
        if (Math.abs(z - 3.9) < 0.35) return 'cage';
        return z > 5 ? 'chrome' : 'hub';
      },
    },
  },
};
export default look;
