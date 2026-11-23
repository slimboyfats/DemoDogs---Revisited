import type { LookModule } from '@demodogs/shared';

/**
 * The skipping bomb: a knobbly red rubber ball with a white band round it and a stub of lit fuse
 * on top.
 */
const look: LookModule = {
  id: 'weapon.chew-toy',
  look: {
    kind: 'prop',
    part: {
      w: 8,
      h: 8,
      layers: 8,
      smooth: true,
      fn: (x, y, z) => {
        const r = Math.hypot(x, y);
        if (z > 7.2) return r < 0.5 ? 'light' : null;
        const zc = z - 3.6;
        const rs = Math.hypot(r, zc);
        // knobs: the skin swells six times round and three times up
        const a = Math.atan2(y, x);
        const knob = 0.3 * Math.cos(a * 6) * Math.cos(zc * 1.8);
        if (rs > 3.2 + knob) return null;
        if (Math.abs(zc) < 0.55 && rs > 2.6) return 'paintw';
        return rs > 2.9 + knob ? 'paintr' : 'paintr2';
      },
    },
  },
};
export default look;
