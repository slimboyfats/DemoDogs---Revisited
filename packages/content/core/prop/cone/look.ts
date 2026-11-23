import type { LookModule } from '@demodogs/shared';

/** A traffic cone: a square foot with rounded corners, a hollow tip and a reflective band. */
const look: LookModule = {
  id: 'prop.cone',
  look: {
    kind: 'prop',
    part: {
      w: 6,
      h: 6,
      layers: 7,
      smooth: true,
      fn: (x, y, z) => {
        const r = Math.hypot(x, y);
        if (z < 0.7)
          return Math.hypot(Math.max(0, Math.abs(x) - 2), Math.max(0, Math.abs(y) - 2)) < 0.8
            ? 'black'
            : null;
        const rad = 2.35 - (z - 0.7) * 0.31;
        if (r > rad || z > 6.7) return null;
        if (z > 6.2 && r < 0.3) return null;
        return (z > 2.9 && z < 4.5) || (z > 5.2 && z < 5.8) ? 'paintw' : 'cone';
      },
    },
  },
};
export default look;
