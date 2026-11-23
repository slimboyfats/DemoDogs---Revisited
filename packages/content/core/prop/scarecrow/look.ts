import type { LookModule } from '@demodogs/shared';

/** A scarecrow: a pole and a crossbar, a ragged red shirt, a straw head under a black hat. */
const look: LookModule = {
  id: 'prop.scarecrow',
  look: {
    kind: 'prop',
    part: {
      w: 4,
      h: 11,
      layers: 14,
      smooth: true,
      fn: (x, y, z) => {
        const r = Math.hypot(x, y);
        // hat: a brim and a crown
        if (z > 11.6) return r < (z < 12.1 ? 2.1 : 1.2) && z < 13.6 ? 'black' : null;
        // head
        if (z > 9.4) {
          if (Math.hypot(x, y, z - 10.5) > 1.4) return null;
          return x > 0.7 && Math.abs(Math.abs(y) - 0.55) < 0.3 && z > 10.4 ? 'black' : 'straw';
        }
        // arms out along y, straw sticking out of the cuffs
        if (z > 7 && z < 8.6 && Math.abs(x) < 0.8) {
          if (Math.abs(y) < 4.2) return 'paintr';
          if (Math.abs(y) < 5.2 && Math.abs(z - 7.8) < 0.5) return 'straw2';
        }
        // the shirt, ragged at the hem
        if (z > 4 + Math.sin(y * 5) * 0.5 && z < 9.4 && Math.abs(x) < 0.9 && Math.abs(y) < 1.7)
          return Math.floor(z * 1.5 + y) % 4 === 0 ? 'paintr2' : 'paintr';
        return r < 0.4 ? 'wood2' : null;
      },
    },
  },
};
export default look;
