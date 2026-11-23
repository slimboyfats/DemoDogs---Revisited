import type { LookModule } from '@demodogs/shared';

/** A ramp: a steel wedge with hazard chevrons up its plate. */
const look: LookModule = {
  id: 'prop.ramp',
  look: {
    kind: 'prop',
    part: {
      w: 20,
      h: 24,
      layers: 7,
      smooth: true,
      fn: (x, y, z) => {
        if (Math.abs(x) > 10.0 || Math.abs(y) > 12.0) return null;
        // a wedge: nothing at the foot, 6 px at the lip
        const top = 0.5 + ((x + 10.0) / 20) * 5.5;
        if (z > top) return null;
        if (z < top - 0.9) {
          // the frame under the plate: steel, open between the ribs
          if (Math.abs(y) > 11.0 || x > 9.0)
            return Math.floor((z + x) / 1.5) % 2 ? 'bumper' : 'engine';
          return Math.abs(y % 6) < 0.6 ? 'engine' : null;
        }
        if (Math.abs(y) > 10.7) return 'chrome';
        const u = x + Math.abs(y) * 0.8 + 40;
        return u % 6 < 3 ? 'hazard' : 'black';
      },
    },
  },
};
export default look;
