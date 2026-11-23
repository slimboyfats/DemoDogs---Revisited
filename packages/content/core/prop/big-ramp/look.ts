import type { LookModule } from '@demodogs/shared';

/** A big ramp: a tall wedge in red and white. */
const look: LookModule = {
  id: 'prop.big-ramp',
  look: {
    kind: 'prop',
    part: {
      w: 28,
      h: 30,
      layers: 10,
      smooth: true,
      fn: (x, y, z) => {
        if (Math.abs(x) > 14.0 || Math.abs(y) > 15.0) return null;
        // a wedge: nothing at the foot, 9 px at the lip
        const top = 0.5 + ((x + 14.0) / 28) * 8.5;
        if (z > top) return null;
        if (z < top - 0.9) {
          // the frame under the plate: steel, open between the ribs
          if (Math.abs(y) > 14.0 || x > 13.0)
            return Math.floor((z + x) / 1.5) % 2 ? 'bumper' : 'engine';
          return Math.abs(y % 6) < 0.6 ? 'engine' : null;
        }
        if (Math.abs(y) > 13.7) return 'chrome';
        const u = x + Math.abs(y) * 0.8 + 40;
        return u % 6 < 3 ? 'paintr' : 'paintw';
      },
    },
  },
};
export default look;
