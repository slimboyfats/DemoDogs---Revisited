import type { LookModule } from '@demodogs/shared';

/** A switch bollard: a steel post in blue and black bands, a lamp on top that glows, a steel collar at its foot. */
const look: LookModule = {
  id: 'prop.switch-bollard',
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
        if (z > 14) return r < 3.2 ? 'glow' : null;
        if (r > 5.2) return null;
        if (z > 12.6) return 'chrome';
        return Math.floor((z - 1.5) / 2.4) % 2 ? 'black' : 'turbowarm';
      },
    },
  },
};
export default look;
