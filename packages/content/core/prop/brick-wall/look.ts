import type { LookModule } from '@demodogs/shared';

/** A length of brick wall, with a coping of darker bricks on top. */
const look: LookModule = {
  id: 'prop.brick-wall',
  look: {
    kind: 'prop',
    part: {
      w: 9,
      h: 4,
      layers: 10,
      fn: (x, y, z) => {
        if (Math.abs(x) > 4.5 || Math.abs(y) > 1.7 || z > 9.6) return null;
        // courses of brick with staggered joints, mortar between
        const course = Math.floor(z / 1.5);
        const joint = z % 1.5 < 0.22 || (((x + (course & 1) * 1.7 + 40) % 3.4) + 3.4) % 3.4 < 0.25;
        if (z > 8.7) return 'paintr2';
        return joint ? 'concrete' : (course + Math.floor(x / 3.4)) % 3 === 0 ? 'paintr2' : 'barrel';
      },
    },
  },
};
export default look;
