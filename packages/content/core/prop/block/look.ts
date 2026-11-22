import type { LookModule } from '@demodogs/shared';

/** A concrete barrier block with a hazard stripe. */
const look: LookModule = {
  id: 'prop.block',
  look: {
    kind: 'prop',
    part: {
      w: 12,
      h: 6,
      layers: 5,
      fn: (x, y, z) => {
        if (Math.abs(x) > 5.7 || Math.abs(y) > 2.9 - z * 0.35) return null;
        return z === 3 ? (Math.floor((x + 6) / 3) % 2 ? 'hazard' : 'black') : 'concrete';
      },
    },
  },
};
export default look;
