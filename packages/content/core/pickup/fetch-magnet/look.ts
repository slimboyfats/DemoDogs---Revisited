import type { LookModule } from '@demodogs/shared';

/** A red horseshoe magnet on a short mast, lying flat with its bright poles to the front. */
const look: LookModule = {
  id: 'pickup.fetch-magnet',
  look: {
    kind: 'prop',
    materials: { magnet: ['#8a1616', '#d42a2a', '#ff7466'] },
    part: {
      w: 6,
      h: 6,
      layers: 6,
      smooth: true,
      fn: (x, y, z) => {
        if (z < 3.5) return Math.hypot(x + 0.9, y) < 0.5 ? 'band' : null;
        if (z > 5.5) return null;
        const ay = Math.abs(y);
        if (x < -0.6) {
          const r = Math.hypot(x + 0.6, y);
          return r < 2.6 && r > 1.2 ? 'magnet' : null;
        }
        if (x > 2.7 || ay < 1.2 || ay > 2.6) return null;
        return x > 1.6 ? 'chrome' : 'magnet';
      },
    },
  },
};
export default look;
