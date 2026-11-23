import type { LookModule } from '@demodogs/shared';
import { hash3 } from '../../../src/shapes';

const SHIRTS = ['paintr', 'crate', 'hazard', 'paintw', 'leaf3', 'cone', 'glow', 'petalv'];

/** A grandstand: four tiers of benches stepping up away from the road, a crowd on them in every colour, a rail along the back. */
const look: LookModule = {
  id: 'prop.grandstand',
  look: {
    kind: 'prop',
    part: {
      // x runs along the road, y back from it
      w: 15,
      h: 12,
      layers: 11,
      smooth: true,
      fn: (x, y, z) => {
        if (Math.abs(x) > 7 || Math.abs(y) > 5.4) return null;
        const tier = Math.min(3, Math.floor((y + 5.4) / 2.7));
        const floor = 1.4 + tier * 1.7;
        if (z < floor) {
          // open framing under the benches, planked in at the ends and the back
          if (Math.abs(x) > 6.4 || y > 4.9) return Math.floor(z / 1.2) % 2 ? 'wood' : 'wood2';
          return Math.abs(x % 4.6) < 0.4 && z > floor - 2.2
            ? 'wood2'
            : z > floor - 0.5
              ? 'wood'
              : null;
        }
        // a rail along the back
        if (y > 4.8)
          return z < floor + 2.8
            ? z > floor + 2.2
              ? 'paintw'
              : Math.abs(x % 3.5) < 0.4
                ? 'paintw'
                : null
            : null;
        // the crowd: someone on most seats, a shirt and a head
        const seat = Math.round(x / 1.5);
        const who = hash3(seat, tier, 11);
        const dx = Math.abs(x - seat * 1.5);
        const dy = Math.abs(y - (-5.4 + tier * 2.7 + 1.5));
        if (who < 0.16 || dx > 0.55 || dy > 0.6) return null;
        const up = z - floor;
        if (up < 1.5) return SHIRTS[Math.floor(who * 53) % SHIRTS.length]!;
        if (up < 2.4 && dx < 0.42 && dy < 0.42)
          return who > 0.6 ? 'plate' : who > 0.35 ? 'wood' : 'bark';
        return null;
      },
    },
  },
};
export default look;
