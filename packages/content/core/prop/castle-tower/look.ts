import type { LookModule } from '@demodogs/shared';
import { KEEP } from '../../../src/themes';

const WALL = 25;
const ROOF = 29;
const TIP = 41;

/**
 * A round tower: dressed stone with arrow slits, a ring of battlements standing out round the
 * top, and a pointed roof of red tiles with a gold ball on it.
 */
const look: LookModule = {
  id: 'prop.castle-tower',
  look: {
    kind: 'prop',
    materials: KEEP,
    part: {
      w: 20,
      h: 20,
      layers: 43,
      smooth: true,
      fn: (x, y, z) => {
        const r = Math.hypot(x, y);
        const a = Math.atan2(y, x) + Math.PI * 2;
        if (z > TIP) return r < 0.9 ? 'gold' : null;
        if (z > ROOF) {
          const roof = 8.2 * ((TIP - z) / (TIP - ROOF)) + 0.3;
          if (r > roof) return null;
          return Math.floor(z * 0.9 + a * 2.2) % 2 ? 'rooftile' : 'rooftile2';
        }
        if (z > WALL) {
          // the battlements, out on corbels
          if (r > 9 || r < 6) return r < 6 ? 'ashlar2' : null;
          if (z < WALL + 1.6) return 'ashlar2';
          return Math.floor(a * 2.55) % 2 ? 'ashlar' : null;
        }
        if (r > 7.5) return null;
        if (r > 6.7) {
          // slits, and a door at the foot on the side that faces out
          if (Math.abs(Math.sin(a * 2)) < 0.07 && z > 11 && z < 16) return 'dark';
          if (y > 0 && Math.abs(x) < 1.7 && z < 6.4 - x * x * 0.45) return 'wood2';
        }
        const course = Math.floor(z / 2.4);
        if (z % 2.4 < 0.3 || (a * 7.5 + (course & 1) * 2.2) % 4.4 < 0.3) return 'mortar';
        return (course + Math.floor((a * 7.5 + (course & 1) * 2.2) / 4.4)) % 4 === 0
          ? 'ashlar2'
          : 'ashlar';
      },
    },
  },
};
export default look;
