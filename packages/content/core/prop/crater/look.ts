import type { LookModule } from '@demodogs/shared';
import { noise3 } from '../../../src/shapes';
import { PEAK, rocky } from '../../../src/themes';

/** Where the lava runs down the cone: three streams, each a way round and how wide. */
const STREAMS = [
  [0.9, 1.5],
  [2.7, 1.1],
  [4.6, 1.3],
] as const;
const RIM = 21;

/**
 * A volcano's cone: steep black rock rising to a broken rim, a lake of lava inside it, and
 * streams of it down the outside.
 */
const look: LookModule = {
  id: 'prop.crater',
  look: {
    kind: 'prop',
    materials: PEAK,
    part: {
      w: 44,
      h: 44,
      layers: 24,
      smooth: true,
      fn: (x, y, z) => {
        const r = Math.hypot(x, y);
        const a = Math.atan2(y, x);
        const rough = (noise3(x * 0.2, y * 0.2, z * 0.25) - 0.5) * 2.4;
        // the cone, steeper towards the top, its rim higher on one side than the other
        const rim = RIM + Math.sin(a * 2 + 1) * 1.4 + Math.sin(a * 5) * 0.7;
        const out = 21.2 - 13.4 * (z / rim) ** 0.85 + rough * 0.6;
        if (r > out || z > rim) return null;
        // the bowl inside the rim, and the lake in the bottom of it
        const bowl = 2.5 + (z - 15) * 0.85;
        if (z > 15 && r < bowl)
          return z < 16.6 ? (noise3(x * 0.4, y * 0.4, 3) > 0.55 ? 'lava2' : 'lava') : null;
        // the streams: only the skin of the cone
        if (r > out - 1.3 && z > 1.2)
          for (const [sa, wide] of STREAMS) {
            let d = a - sa - Math.sin(z * 0.3 + sa) * 0.12;
            d = Math.atan2(Math.sin(d), Math.cos(d));
            if (Math.abs(d) * r < wide * (0.5 + z / rim) * 0.9)
              return z % 3 < 0.6 ? 'lava2' : 'lava';
          }
        if (z > rim - 1.6) return 'basalt3';
        return rocky(x, y, z, 'basalt', 'basalt2');
      },
    },
  },
};
export default look;
