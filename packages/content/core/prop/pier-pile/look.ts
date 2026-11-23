import type { LookModule } from '@demodogs/shared';

/** A tarred timber pile standing up from the pier edge, with a turn of rope round it. */
const look: LookModule = {
  id: 'prop.pier-pile',
  look: {
    kind: 'prop',
    part: {
      w: 4,
      h: 4,
      layers: 7,
      smooth: true,
      fn: (x, y, z) => {
        const r = Math.hypot(x, y);
        if (z > 4.2 && z < 5 && r < 1.7) return 'wood';
        if (r > 1.35) return null;
        return z > 6.4 ? 'wood2' : 'bark2';
      },
    },
  },
};
export default look;
