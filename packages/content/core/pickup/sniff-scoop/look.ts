import type { LookModule } from '@demodogs/shared';

/** A bonnet scoop: a steel box with a red stripe that rises to a wide dark mouth at the front, with a chrome lip. */
const look: LookModule = {
  id: 'pickup.sniff-scoop',
  look: {
    kind: 'prop',
    part: {
      w: 6,
      h: 6,
      layers: 4,
      smooth: true,
      fn: (x, y, z) => {
        const ay = Math.abs(y);
        if (x < -2.7 || x > 2.5) return null;
        const k = (x + 2.7) / 5.2;
        const top = 0.8 + 2.4 * k * k * (3 - 2 * k);
        const half = 1.6 + 0.9 * k;
        if (ay > half || z > top) return null;
        // the mouth: hollow behind a mesh, a bright lip round it
        if (x > 1.7) {
          const lip = ay > half - 0.45 || z > top - 0.45 || z < 0.45;
          if (lip) return 'chrome';
          if (x > 2.2) return null;
          return (((y * 2.5) | 0) + ((z * 2.5) | 0)) % 2 ? 'grille' : 'black';
        }
        return z > top - 0.35 && ay < 0.6 ? 'paintr' : 'band';
      },
    },
  },
};
export default look;
