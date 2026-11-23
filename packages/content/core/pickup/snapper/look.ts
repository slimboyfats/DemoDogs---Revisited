import type { LookModule } from '@demodogs/shared';

/**
 * A squat turret: a round base, a domed head and two short barrels. Drawn on the roof of a car
 * that carries flak; the client turns it to face what it shoots at.
 */
const look: LookModule = {
  id: 'pickup.snapper',
  look: {
    kind: 'prop',
    part: {
      w: 7,
      h: 4,
      layers: 3,
      smooth: true,
      fn: (x, y, z) => {
        const r = Math.hypot(x + 1, y);
        if (z < 0.7) return r < 1.95 ? 'mine' : null;
        if (z < 2.9 && r < 1.55 - Math.max(0, z - 1.5) * 0.55) return z > 2.3 ? 'chrome' : 'band';
        // twin barrels out of the front of the head
        if (x > -0.2 && x < 3.1 && z > 1.15 && z < 1.95 && Math.abs(Math.abs(y) - 0.65) < 0.36)
          return x > 2.5 ? 'chrome' : 'black';
        return null;
      },
    },
  },
};
export default look;
