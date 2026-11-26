import type { LookModule } from '@demodogs/shared';

/** A pop-up bollard: a steel post in yellow and black bands, a lamp on top, a steel collar at its foot. */
const look: LookModule = {
  id: 'prop.pop-bollard',
  look: {
    kind: 'prop',
    part: {
      w: 13,
      h: 13,
      layers: 16,
      smooth: true,
      fn: (x, y, z) => {
        const r = Math.hypot(x, y);
        if (z < 1.5) return r < 6.4 ? 'chrome' : null;
        if (z > 14) return r < 3.2 ? 'amber' : null;
        if (r > 5.2) return null;
        if (z > 12.6) return 'chrome';
        return Math.floor((z - 1.5) / 2.4) % 2 ? 'black' : 'hazard';
      },
    },
  },
};
export default look;
