import type { LookModule } from '@demodogs/shared';

/** A boxy fuel pump on a concrete plinth: a glass dial, a white panel and a hose down one side. */
const look: LookModule = {
  id: 'prop.gas-pump',
  look: {
    kind: 'prop',
    part: {
      w: 8,
      h: 6,
      layers: 14,
      fn: (x, y, z) => {
        if (z < 1.5) return Math.abs(x) < 3.6 && Math.abs(y) < 2.8 ? 'concrete' : null;
        if (y > 1.9 && y < 2.7 && Math.abs(x) < 0.6 && z < 10) return 'black';
        if (Math.abs(x) > 2.4 || Math.abs(y) > 1.8) return null;
        if (z > 12.6) return 'chrome';
        if (z > 9 && z < 11.6) return Math.abs(x) < 1.7 ? 'glasshi' : 'paintr';
        if (z > 4 && z < 7.5 && Math.abs(x) < 1.7) return 'paintw';
        return 'paintr';
      },
    },
  },
};
export default look;
