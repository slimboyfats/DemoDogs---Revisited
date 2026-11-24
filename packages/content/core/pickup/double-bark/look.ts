import type { LookModule } from '@demodogs/shared';

/**
 * Two gun barrels, one each side of the grille, each out of its own breech block. They are fitted
 * into the nose, so the breeches are inside the bodywork and the barrels stand out in front.
 */
const look: LookModule = {
  id: 'pickup.double-bark',
  look: {
    kind: 'prop',
    part: {
      w: 10,
      h: 8,
      layers: 3,
      smooth: true,
      fn: (x, y, z) => {
        const ay = Math.abs(y);
        // the breech
        if (x < -1.2) {
          if (x < -4.4 || ay < 1.4 || ay > 3.4 || z > 2.5) return null;
          if (z > 1.9 && ay > 1.8 && ay < 3.0) return (((x * 2.2) | 0) + 9) % 2 ? 'hazard' : 'band';
          return 'mine';
        }
        // the barrels, each with a fat muzzle
        const r = Math.hypot(ay - 2.4, z - 1.3);
        if (x > 4.6) return null;
        if (x > 3.4) return r < 0.95 ? (r < 0.4 ? null : 'black') : null;
        if (r < 0.7) return 'bumper';
        // a clamp round each barrel
        return Math.abs(x - 1) < 0.4 && r < 0.95 ? 'chrome' : null;
      },
    },
  },
};
export default look;
