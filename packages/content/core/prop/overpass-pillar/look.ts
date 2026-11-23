import type { LookModule } from '@demodogs/shared';

/** A concrete leg of the raised road: a square column, banded, with a cap that takes the deck. */
const look: LookModule = {
  id: 'prop.overpass-pillar',
  look: {
    kind: 'prop',
    part: {
      w: 10,
      h: 10,
      layers: 22,
      fn: (x, y, z) => {
        const m = Math.max(Math.abs(x), Math.abs(y));
        if (z >= 18) return m < 4.9 ? 'concrete' : null;
        if (m > 3.2) return null;
        if (z < 1) return 'concrete';
        return z % 6 === 5 ? 'hazard' : 'concrete';
      },
    },
  },
};
export default look;
