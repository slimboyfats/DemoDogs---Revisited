import type { LookModule } from '@demodogs/shared';

/** A length of white picket fence: even boards with pointed tops on two rails. */
const look: LookModule = {
  id: 'prop.plank-fence',
  look: {
    kind: 'prop',
    part: {
      w: 9,
      h: 3,
      layers: 8,
      fn: (x, y, z) => {
        if (Math.abs(x) > 4.5 || Math.abs(y) > 1) return null;
        if (Math.abs(y) > 0.45)
          return Math.abs(z - 2) < 0.5 || Math.abs(z - 5) < 0.5 ? 'picket2' : null;
        // each board comes to a point
        const across = ((x + 4.5) % 1.5) - 0.75;
        if (Math.abs(across) > 0.6 || z > 7.6 - Math.abs(across) * 2.4) return null;
        return 'picket';
      },
    },
  },
};
export default look;
