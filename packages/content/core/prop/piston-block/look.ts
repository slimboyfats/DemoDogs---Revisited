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
      w: 19,
      h: 19,
      layers: 16,
      smooth: true,
      fn: (x, y, z) => {
        const m = Math.max(Math.abs(x), Math.abs(y));
        if (z < 1.5) return m < 9.2 ? 'chrome' : null;
        if (m > 8.4 || Math.abs(x) + Math.abs(y) > 15 || z > 15) return null;
        // its top: a steel rim round an amber lamp
        if (z > 13.5) return m < 4.6 ? 'amber' : m > 7 ? 'chrome' : 'black';
        // chevrons round its sides
        const u = Math.abs(x) > Math.abs(y) ? y : x;
        return Math.floor((Math.abs(u) + z) / 3.2) % 2 ? 'black' : 'hazard';
      },
    },
  },
};
export default look;
