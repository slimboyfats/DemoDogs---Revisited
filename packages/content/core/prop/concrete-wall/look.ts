import type { LookModule } from '@demodogs/shared';

/** A slab of cast concrete: board marks across it, rusty bar ends along the top. */
const look: LookModule = {
  id: 'prop.concrete-wall',
  look: {
    kind: 'prop',
    part: {
      w: 9,
      h: 4,
      layers: 11,
      fn: (x, y, z) => {
        if (Math.abs(x) > 4.5 || Math.abs(y) > 1.6) return null;
        if (z > 10) return z < 10.9 && Math.abs(y) < 0.3 && (x + 40) % 2.2 < 0.4 ? 'rust' : null;
        if (z % 3.3 < 0.2) return 'stone';
        return ((x * 3 + z * 5) | 0) % 11 === 0 ? 'stone' : 'concrete';
      },
    },
  },
};
export default look;
