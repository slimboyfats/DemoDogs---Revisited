import type { LookModule } from '@demodogs/shared';

/**
 * A mast with a little dish facing forward and a red lamp on its tip. Drawn on the roof of a car
 * that is jamming gunsights.
 */
const look: LookModule = {
  id: 'pickup.dog-whistle',
  look: {
    kind: 'prop',
    part: {
      w: 4,
      h: 4,
      layers: 6,
      smooth: true,
      fn: (x, y, z) => {
        const r = Math.hypot(x, y);
        if (z < 0.6) return r < 1 ? 'mine' : null;
        if (z > 5.2) return r < 0.5 ? 'minelit' : null;
        if (r < 0.38) return 'band';
        // the dish: a shallow bowl on its side, open towards +x
        const d = Math.hypot(y, z - 3.3);
        if (d > 1.7) return null;
        const bowl = -0.2 + d * d * 0.42;
        return Math.abs(x - bowl) < 0.3 ? 'paintw' : null;
      },
    },
  },
};
export default look;
