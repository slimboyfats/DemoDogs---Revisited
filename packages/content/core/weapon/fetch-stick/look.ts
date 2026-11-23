import type { LookModule } from '@demodogs/shared';

/**
 * The throwing stick: a flat bent stick, its two arms opening forward from the elbow, bare wood
 * with red paint on the tips so you can see it spin.
 */
const look: LookModule = {
  id: 'weapon.fetch-stick',
  look: {
    kind: 'prop',
    part: {
      w: 9,
      h: 9,
      layers: 2,
      smooth: true,
      fn: (x, y, z) => {
        // each arm: the stretch from the elbow at (-2.2, 0) out to a tip at (3.2, +-3.4)
        const ax = x + 2.2;
        const ay = Math.abs(y);
        const t = Math.max(0, Math.min(1, (ax * 5.4 + ay * 3.4) / 40.72));
        const d = Math.hypot(ax - t * 5.4, ay - t * 3.4);
        // thick in the middle of its depth, thin at the edges, like a wing
        if (d > 0.95 - Math.abs(z - 1) * 0.35) return null;
        return t > 0.78 ? 'paintr' : t < 0.12 ? 'wood2' : 'wood';
      },
    },
  },
};
export default look;
