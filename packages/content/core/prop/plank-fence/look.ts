import type { LookModule } from '@demodogs/shared';

/** A length of board fence: upright planks of uneven height on two rails. */
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
        const plank = Math.floor((x + 4.5) / 1.5);
        const top = 6.4 + ((plank * 7) % 3) * 0.5;
        if (Math.abs(y) > 0.45)
          return Math.abs(z - 2) < 0.5 || Math.abs(z - 5) < 0.5 ? 'wood2' : null;
        if (z > top || (x + 4.5) % 1.5 < 0.16) return null;
        return plank % 2 === 0 ? 'wood' : 'wood2';
      },
    },
  },
};
export default look;
