import type { LookModule } from '@demodogs/shared';

/** A length of bridge railing: a post at each end, a top rail and a kerb rail, rust at the feet. */
const look: LookModule = {
  id: 'prop.rail-steel',
  look: {
    kind: 'prop',
    part: {
      w: 9,
      h: 3,
      layers: 7,
      fn: (x, y, z) => {
        const ax = Math.abs(x);
        if (ax > 4.5 || Math.abs(y) > 0.9) return null;
        if (ax > 3.7) return z < 1.2 ? 'rust' : 'cage';
        if (Math.abs(y) > 0.5) return null;
        if (z > 5 && z < 6.2) return 'cage';
        if (z < 1.4) return (x * 3) % 2 < 0.4 ? 'rust' : 'engine';
        if (Math.abs(z - 3.3) < 0.4) return 'band';
        return null;
      },
    },
  },
};
export default look;
