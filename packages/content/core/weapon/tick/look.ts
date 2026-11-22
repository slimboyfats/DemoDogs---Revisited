import type { LookModule } from '@demodogs/shared';

/**
 * The sticky bomb: a black puck on a gummy pad, with a red lamp on top (the client blinks
 * `minelit`, faster as the fuse runs down).
 */
const look: LookModule = {
  id: 'weapon.tick',
  look: {
    kind: 'prop',
    part: {
      w: 5,
      h: 5,
      layers: 3,
      smooth: true,
      fn: (x, y, z) => {
        const r = Math.hypot(x, y);
        if (z < 0.6) return r < 2.3 ? 'cone' : null;
        if (z > 2) return r < 0.7 ? 'minelit' : null;
        if (r > 1.9) return null;
        return r > 1.5 ? 'band' : 'black';
      },
    },
  },
};
export default look;
