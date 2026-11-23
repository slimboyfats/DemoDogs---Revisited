import type { LookModule } from '@demodogs/shared';

/**
 * A shell on its way down, nose first: a stubby dark bomb with a hazard band and four red fins
 * at the tail (which is the top).
 */
const look: LookModule = {
  id: 'weapon.dog-pile',
  look: {
    kind: 'prop',
    part: {
      w: 5,
      h: 5,
      layers: 9,
      smooth: true,
      fn: (x, y, z) => {
        const r = Math.hypot(x, y);
        if (z > 6.4) {
          // fins: two plates crossing over a thin tail
          if (r < 0.5) return 'black';
          return (Math.abs(x) < 0.3 || Math.abs(y) < 0.3) && r < 2.2 ? 'tail' : null;
        }
        const rad = z < 2.4 ? 0.5 + z * 0.65 : 2.05 - Math.max(0, z - 5) * 0.7;
        if (r > rad) return null;
        return z > 3.4 && z < 4.6 && r > rad - 0.6 ? 'hazard' : 'mine';
      },
    },
  },
};
export default look;
