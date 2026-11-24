import type { LookModule } from '@demodogs/shared';

/** A speed bump: a rounded hump in hazard stripes, its ends sloped off. */
const look: LookModule = {
  id: 'prop.speed-bump',
  look: {
    kind: 'prop',
    part: {
      w: 10,
      h: 24,
      layers: 3,
      smooth: true,
      fn: (x, y, z) => {
        if (Math.abs(x) >= 5.0 || Math.abs(y) >= 12.0) return null;
        const end = Math.min(1, (12.0 - Math.abs(y)) / 3);
        const top = 2.8 * 0.5 * (1 + Math.cos((Math.PI * x) / 5.0)) * end;
        if (z > top || top < 0.25) return null;
        return Math.floor((y + 48 + x * 0.6) / 4) % 2 ? 'hazard' : 'black';
      },
    },
  },
};
export default look;
