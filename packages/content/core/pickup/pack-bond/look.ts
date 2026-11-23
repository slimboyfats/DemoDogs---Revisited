import type { LookModule } from '@demodogs/shared';

/**
 * A short post with a red studded collar looped round its top: where the leash is tied on. Drawn
 * on the roof of a leashed car; the leash itself is sparks.
 */
const look: LookModule = {
  id: 'pickup.pack-bond',
  look: {
    kind: 'prop',
    part: {
      w: 4,
      h: 4,
      layers: 5,
      smooth: true,
      fn: (x, y, z) => {
        const r = Math.hypot(x, y);
        if (z < 0.6) return r < 1.1 ? 'band' : null;
        if (z < 3.2) return r < 0.5 ? 'band' : null;
        // the collar: a ring lying on top of the post, a stud every sixth of the way round
        if (z > 4.4 || r > 1.75 || r < 0.85) return r < 0.5 && z < 3.7 ? 'chrome' : null;
        const a = Math.atan2(y, x) / (Math.PI * 2) + 0.5;
        return (((a * 6) % 1) + 1) % 1 < 0.28 ? 'light' : 'tail';
      },
    },
  },
};
export default look;
