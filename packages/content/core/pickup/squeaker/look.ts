import type { LookModule } from '@demodogs/shared';

/**
 * A rack of two launch tubes leaning back, a red rubber squeaky ball sat in the mouth of each.
 * Drawn on the boot of a car that carries decoys; +x faces the way the car goes.
 */
const look: LookModule = {
  id: 'pickup.squeaker',
  look: {
    kind: 'prop',
    part: {
      w: 4,
      h: 6,
      layers: 5,
      smooth: true,
      fn: (x, y, z) => {
        const ay = Math.abs(y);
        if (z < 0.8) return ay < 2.5 && Math.abs(x) < 1.6 ? 'band' : null;
        // the tubes lean back as they rise
        const cx = x + (z - 0.8) * 0.22;
        const cy = ay - 1.25;
        if (z < 3.1) {
          const r = Math.hypot(cx, cy);
          return r < 1.05 ? (r < 0.6 && z > 2.5 ? 'black' : 'mine') : null;
        }
        const b = Math.hypot(cx, cy, z - 3.6);
        if (b > 1.0) return null;
        return Math.abs(z - 3.6) < 0.22 ? 'paintw' : 'paintr';
      },
    },
  },
};
export default look;
