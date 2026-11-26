import type { LookModule } from '@demodogs/shared';
import { noise3 } from '../../../src/shapes';
import { GROTTO, rocky } from '../../../src/themes';

/** Each spike: where it stands, how tall and how thick at the foot. */
const SPIKES = [
  [-0.6, -0.4, 19, 4.4],
  [3, 1.8, 9, 2.6],
  [-3.2, 2.2, 6, 2.2],
] as const;

/** Stalagmites: three spikes of banded violet rock, pale at their tips. */
const look: LookModule = {
  id: 'prop.stalagmite',
  look: {
    kind: 'prop',
    materials: GROTTO,
    part: {
      w: 14,
      h: 14,
      layers: 20,
      smooth: true,
      fn: (x, y, z) => {
        for (const [sx, sy, tall, thick] of SPIKES) {
          if (z > tall) continue;
          const r =
            thick * (1 - z / tall) ** 0.75 + (noise3(x * 0.4, y * 0.4, z * 0.3) - 0.5) * 0.9;
          if (Math.hypot(x - sx, y - sy) > r) continue;
          if (z > tall * 0.78) return 'stalk';
          return Math.floor(z * 0.7 + noise3(x * 0.2, y * 0.2, 5) * 2) % 3 === 0
            ? 'cave2'
            : rocky(x, y, z, 'cave', 'cave2');
        }
        return null;
      },
    },
  },
};
export default look;
