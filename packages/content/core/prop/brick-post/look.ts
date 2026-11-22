import type { LookModule } from '@demodogs/shared';

/** A square brick pier with a concrete cap. */
const look: LookModule = {
  id: 'prop.brick-post',
  look: {
    kind: 'prop',
    part: {
      w: 6,
      h: 6,
      layers: 12,
      fn: (x, y, z) => {
        if (Math.abs(x) > 2.7 || Math.abs(y) > 2.7 || z > 11.6) return null;
        if (z > 10.4) return Math.abs(x) < 2.9 && Math.abs(y) < 2.9 ? 'concrete' : null;
        // courses of brick with staggered joints, mortar between
        const course = Math.floor(z / 1.5);
        const joint = z % 1.5 < 0.22 || (((x + (course & 1) * 1.7 + 40) % 3.4) + 3.4) % 3.4 < 0.25;
        return joint ? 'concrete' : course % 2 === 0 ? 'barrel' : 'paintr2';
      },
    },
  },
};
export default look;
