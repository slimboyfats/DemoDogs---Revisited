import type { LookModule } from '@demodogs/shared';

/**
 * Two long sprung feelers fanned out ahead from a bar across the nose, an amber bead on the tip of
 * each. Drawn on the nose of a car with whiskers.
 */
const look: LookModule = {
  id: 'pickup.whiskers',
  look: {
    kind: 'prop',
    part: {
      w: 10,
      h: 16,
      layers: 2,
      smooth: true,
      fn: (x, y, z) => {
        const ay = Math.abs(y);
        if (x < -3.6) return ay < 5 && z > 0.5 && z < 1.5 ? 'band' : null;
        // each feeler runs from the bar out and forward
        const t = (x + 3.6) / 8.2;
        if (t > 1) return null;
        const wy = 2.2 + t * 5.2 + Math.sin(t * 3) * 0.4;
        if (t > 0.9) return Math.hypot(ay - wy, z - 1) < 0.75 ? 'amber' : null;
        return Math.abs(ay - wy) < 0.34 && z > 0.65 && z < 1.35 ? 'chrome' : null;
      },
    },
  },
};
export default look;
