import type { LookModule } from '@demodogs/shared';

/**
 * The Bloodhound in flight: a fat red rocket with a hound's black nose, two floppy brown ears
 * swept back along its sides, white fins and a burning tail. Big enough to be seen over a pack.
 */
const look: LookModule = {
  id: 'pickup.bloodhound',
  look: {
    kind: 'prop',
    materials: {
      houndred: ['#8f1420', '#d42a2a', '#ff6a4a'],
      houndear: ['#4a2a14', '#7a4a22', '#a86a34'],
      houndember: ['#ff7a1a', '#ffb030', '#fff0a0'],
    },
    part: {
      w: 18,
      h: 9,
      layers: 7,
      smooth: true,
      fn: (x, y, z) => {
        const zc = z - 3;
        const r = Math.hypot(y, zc);
        // fins at the tail: two flat, one upright
        if (x < -4.5 && x > -8.4) {
          const span = 4 * Math.min(1, (x + 8.6) / 2.6 + 0.25);
          if (
            (Math.abs(zc) < 0.35 && Math.abs(y) < span) ||
            (Math.abs(y) < 0.35 && zc > 0 && zc < span)
          )
            return 'paintw';
        }
        // the ears: flaps laid back along each side, hanging a little
        if (x > -2.5 && x < 3.4 && Math.abs(Math.abs(y) - 2.5) < 0.55 && zc < 1.6 && zc > -2.6)
          return 'houndear';
        if (x < -7.6) return r < 1.1 ? 'houndember' : null;
        // the body, and a snout that tapers to the nose
        const rad = x > 3.6 ? Math.max(0, 2.2 * (1 - (x - 3.6) / 5.2)) + 0.5 : 2.2;
        if (x > 8.6 || r > rad) return null;
        if (x > 7.2) return 'black';
        if (Math.abs(x + 3.4) < 0.45) return 'paintw';
        // eyes
        if (x > 3.2 && x < 4.4 && Math.abs(Math.abs(y) - 1.1) < 0.5 && zc > 0.6) return 'light';
        return 'houndred';
      },
    },
  },
};
export default look;
