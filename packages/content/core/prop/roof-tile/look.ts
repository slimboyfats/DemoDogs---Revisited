import type { LookModule } from '@demodogs/shared';

/** A square of roof: rafters under rows of clay tiles, held up at wall height. */
const look: LookModule = {
  id: 'prop.roof-tile',
  look: {
    kind: 'prop',
    part: {
      w: 9,
      h: 9,
      layers: 12,
      fn: (x, y, z) => {
        if (Math.abs(x) > 4.5 || Math.abs(y) > 4.5 || z < 8.6) return null;
        if (z < 9.6) return Math.abs(((x + 40) % 3) - 1.5) < 0.5 ? 'wood2' : null;
        const ridge = z - 9.6 < 1.6 - Math.abs(y) * 0.12;
        if (!ridge) return null;
        return (y + 40) % 2.2 < 0.3
          ? 'paintr2'
          : (x + Math.floor((y + 40) / 2.2) * 1.3 + 40) % 2.6 < 0.25
            ? 'paintr2'
            : 'cone';
      },
    },
  },
};
export default look;
