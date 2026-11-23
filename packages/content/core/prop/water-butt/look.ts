import type { LookModule } from '@demodogs/shared';

/** A blue plastic tub of water with a dark lid and two hoops. */
const look: LookModule = {
  id: 'prop.water-butt',
  look: {
    kind: 'prop',
    part: {
      w: 14,
      h: 14,
      layers: 10,
      smooth: true,
      fn: (x, y, z) => {
        const r = Math.hypot(x, y);
        const hoop = Math.abs(z - 3) < 0.35 || Math.abs(z - 7) < 0.35;
        if (r > (hoop ? 6.2 : 5.9) - Math.max(0, 1.2 - z) * 0.6) return null;
        if (z > 9.3) return r > 5.2 ? 'band' : null;
        if (z > 8.8) return r < 4.6 ? 'glasshi' : 'crate';
        if (hoop) return 'band';
        return 'crate';
      },
    },
  },
};
export default look;
