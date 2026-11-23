import type { LookModule } from '@demodogs/shared';

/** An oil drum: two rolled ribs, a rim round a sunken lid, a bung and a hazard mark. */
const look: LookModule = {
  id: 'prop.barrel',
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
        if (z > 7) {
          // the lid: a bung to one side, a hazard disc in the middle
          if (Math.hypot(x - 1.9, y + 1.2) < 0.55) return 'band';
          if (r < 1.5) return r < 0.5 || (Math.abs(x) < 0.25 && r < 1.2) ? 'black' : 'hazard';
          return 'barrel';
        }
        if (rib || z < 0.4) return 'band';
        // a warning panel on two sides
        if (Math.abs(x) < 1.5 && z > 3.3 && z < 4.7)
          return ((((x + z) * 1.6) | 0) & 1) === 0 ? 'hazard' : 'black';
        return 'barrel';
      },
    },
  },
};
export default look;
