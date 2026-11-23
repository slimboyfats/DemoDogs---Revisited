import type { LookModule } from '@demodogs/shared';

/** A black oil drum: two rolled ribs, a rim round a sunken lid and a yellow band. */
const look: LookModule = {
  id: 'prop.oil-drum',
  look: {
    kind: 'prop',
    part: {
      w: 9,
      h: 9,
      layers: 8,
      smooth: true,
      fn: (x, y, z) => {
        const r = Math.hypot(x, y);
        const rib = Math.abs(z - 2.6) < 0.32 || Math.abs(z - 5.3) < 0.32;
        if (r > (rib ? 3.95 : 3.7)) return null;
        if (z > 7.4) return r > 3.2 ? 'band' : null;
        if (z > 7) return Math.hypot(x + 1.8, y - 1.1) < 0.6 ? 'band' : r < 1.3 ? 'under' : 'black';
        if (rib || z < 0.4) return 'band';
        return z > 3.4 && z < 4.6 ? 'hazard' : 'black';
      },
    },
  },
};
export default look;
