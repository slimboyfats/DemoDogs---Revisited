import type { LookModule } from '@demodogs/shared';

/**
 * What is left of a mud pie on the car it hit: a wet brown dollop slumped over the roof, lumpy,
 * with runs of it going down the sides.
 */
const look: LookModule = {
  id: 'pickup.mud-pie',
  look: {
    kind: 'prop',
    materials: {
      mudpie: ['#33210f', '#553a1c', '#7c5a30'],
      mudpie2: ['#27180a', '#402a13', '#5e4222'],
    },
    part: {
      w: 12,
      h: 10,
      layers: 4,
      smooth: true,
      fn: (x, y, z) => {
        const a = Math.atan2(y, x);
        // a ragged edge: tongues of it run out further here and there
        const edge = 3.6 + Math.sin(a * 3 + 0.6) * 0.9 + Math.sin(a * 7 + 2) * 0.5;
        const r = Math.hypot(x * 0.85, y);
        if (r > edge) return null;
        const top = 3.2 * (1 - (r / edge) ** 2) + 0.5 + Math.sin(x * 2.2) * Math.sin(y * 2.6) * 0.3;
        if (z > top) return null;
        return Math.sin(x * 1.7 + 1) * Math.sin(y * 2.1) > 0.35 ? 'mudpie2' : 'mudpie';
      },
    },
  },
};
export default look;
