import type { LookModule } from '@demodogs/shared';

/** A tall square brick stack that tapers to a concrete collar and a sooty mouth. */
const look: LookModule = {
  id: 'prop.chimney',
  look: {
    kind: 'prop',
    part: {
      w: 10,
      h: 10,
      layers: 40,
      fn: (x, y, z) => {
        const half = 4.4 - z * 0.04;
        const m = Math.max(Math.abs(x), Math.abs(y));
        if (m > half) return null;
        if (z > 37) return m < half - 1 ? 'black' : 'concrete';
        if (z > 34 && z < 36) return 'concrete';
        if (z < 2) return 'concrete';
        const course = Math.floor(z / 1.5);
        const joint =
          z % 1.5 < 0.22 || (((x + y + (course & 1) * 1.7 + 40) % 3.4) + 3.4) % 3.4 < 0.25;
        return joint ? 'concrete' : course % 2 === 0 ? 'barrel' : 'paintr2';
      },
    },
  },
};
export default look;
