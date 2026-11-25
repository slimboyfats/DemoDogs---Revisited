import type { LookModule } from '@demodogs/shared';

/** A length of park fence: a square post and two pale rails, open between them. */
const look: LookModule = {
  id: 'prop.rail-fence',
  look: {
    kind: 'prop',
    scale: 1.5,
    materials: {
      rail: ['#7a5228', '#a8763c', '#cf9a56'],
      railpost: ['#62401e', '#8a5c2c', '#b07c42'],
    },
    part: {
      w: 6,
      h: 2,
      layers: 6,
      smooth: true,
      fn: (x, y, z) => {
        if (Math.abs(y) > 0.8) return null;
        if (Math.abs(x) < 0.8) return z < 5.6 ? 'railpost' : null;
        if (Math.abs(y) > 0.45) return null;
        return Math.abs(z - 2.2) < 0.5 || Math.abs(z - 4.3) < 0.5 ? 'rail' : null;
      },
    },
  },
};
export default look;
