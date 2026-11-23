import type { LookModule } from '@demodogs/shared';

/**
 * A band of bubble wrap: rows of clear blisters on a pale sheet. Drawn round the front and the
 * back bumper of a wrapped car.
 */
const look: LookModule = {
  id: 'pickup.bubble-wrap',
  look: {
    kind: 'prop',
    part: {
      w: 2,
      h: 12,
      layers: 4,
      smooth: true,
      fn: (x, y, z) => {
        const ay = Math.abs(y);
        if (ay > 5.7 || z < 0.5 || z > 3.6 || Math.abs(x) > 0.9) return null;
        if (Math.abs(x) < 0.35) return 'paintw';
        // blisters in staggered rows
        const row = Math.floor(z / 1.05);
        const u = (((y + (row % 2) * 0.6) % 1.2) + 1.2) % 1.2;
        return Math.hypot(u - 0.6, (z % 1.05) - 0.52) < 0.45 ? 'glasshi' : null;
      },
    },
  },
};
export default look;
