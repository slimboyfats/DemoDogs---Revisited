import type { LookModule } from '@demodogs/shared';

/** One coil spring with a plate at each end. A sprung car is drawn standing on four of them. */
const look: LookModule = {
  id: 'pickup.springs',
  look: {
    kind: 'prop',
    part: {
      w: 4,
      h: 4,
      layers: 5,
      smooth: true,
      fn: (x, y, z) => {
        const r = Math.hypot(x, y);
        if (r > 1.75) return null;
        if (z < 0.45 || z > 4.55) return 'band';
        if (r < 1.0) return null;
        const a = Math.atan2(y, x) / (Math.PI * 2);
        return (((z * 0.85 - a) % 1) + 1) % 1 < 0.42 ? 'chrome' : null;
      },
    },
  },
};
export default look;
