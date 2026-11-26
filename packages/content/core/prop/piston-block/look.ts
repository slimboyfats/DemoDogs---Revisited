import type { LookModule } from '@demodogs/shared';

/**
 * A piston block: a squared steel block in yellow and black chevrons on every side, an amber
 * lamp let into its top, on a steel collar it sinks into.
 */
const look: LookModule = {
  id: 'prop.piston-block',
  look: {
    kind: 'prop',
    part: {
      w: 17,
      h: 17,
      layers: 16,
      smooth: true,
      fn: (x, y, z) => {
        const m = Math.max(Math.abs(x), Math.abs(y));
        if (z < 1.5) return m < 8.2 ? 'chrome' : null;
        if (m > 7.6 || Math.abs(x) + Math.abs(y) > 13.6 || z > 15) return null;
        // its top: a steel rim round an amber lamp
        if (z > 13.5) return m < 4.2 ? 'amber' : m > 6.3 ? 'chrome' : 'black';
        // chevrons round its sides
        const u = Math.abs(x) > Math.abs(y) ? y : x;
        return Math.floor((Math.abs(u) + z) / 3.2) % 2 ? 'black' : 'hazard';
      },
    },
  },
};
export default look;
