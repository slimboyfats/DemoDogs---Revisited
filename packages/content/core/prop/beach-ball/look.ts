import type { LookModule } from '@demodogs/shared';
import { BAY } from '../../../src/themes';

const GORES = ['paintr', 'paintw', 'sea', 'paintw', 'sunny', 'paintw'] as const;

/** A beach ball: six gores in red, blue and yellow with white between, a white cap on top. */
const look: LookModule = {
  id: 'prop.beach-ball',
  look: {
    kind: 'prop',
    materials: BAY,
    part: {
      w: 10,
      h: 10,
      layers: 10,
      smooth: true,
      fn: (x, y, z) => {
        const dz = z - 4.8;
        if (Math.hypot(x, y, dz) > 4.7) return null;
        if (Math.hypot(x, y) < 1.3 && dz > 0) return 'paintw';
        const k = Math.floor(((Math.atan2(y, x) + Math.PI) / (Math.PI * 2)) * 6) % 6;
        return GORES[k]!;
      },
    },
  },
};
export default look;
