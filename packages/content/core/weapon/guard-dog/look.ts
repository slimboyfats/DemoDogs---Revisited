import type { LookModule } from '@demodogs/shared';

/**
 * The turret: three splayed feet, a squat swivel housing with a red eye, an ammunition box on
 * its flank and a barrel with a shroud pointing forward.
 */
const look: LookModule = {
  id: 'weapon.guard-dog',
  look: {
    kind: 'prop',
    part: {
      w: 11,
      h: 9,
      layers: 6,
      smooth: true,
      fn: (x, y, z) => {
        const r = Math.hypot(x + 0.8, y);
        if (z < 1.2) {
          // feet: three legs out from the middle
          if (r < 1.4) return 'mine';
          const a = Math.atan2(y, x + 0.8);
          const leg = Math.abs(((a / (Math.PI * 2)) * 3 + 0.5) % 1) - 0.5;
          return r < 3.9 && Math.abs(leg) < 0.5 / (r + 0.5) + 0.04 ? 'band' : null;
        }
        if (z < 2) return r < 1.1 ? 'mine' : null;
        // the barrel and its shroud
        if (x > 0.6 && z > 2.6 && z < 4.2) {
          const rb = Math.hypot(y, z - 3.4);
          if (x < 2.8) return rb < 0.8 ? 'black' : null;
          if (x < 5.3) return rb < 0.42 ? (x > 4.6 ? 'black' : 'band') : null;
          return null;
        }
        // the ammunition box on the left flank
        if (y < -1.5 && y > -3.3 && x > -2.4 && x < 0.4 && z < 4)
          return z > 3.5 ? 'band' : 'hazard';
        // the housing, with the eye over the barrel
        if (z > 5.2) return r < 0.6 ? 'minelit' : null;
        if (Math.abs(x + 0.8) > 1.9 || Math.abs(y) > 1.6) return null;
        return z > 4.6 ? 'botdark' : Math.abs(y) > 1.1 ? 'mine' : 'botdark';
      },
    },
  },
};
export default look;
