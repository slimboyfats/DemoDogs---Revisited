import type { LookModule } from '@demodogs/shared';
import { hash3 } from '../../../src/shapes';

/**
 * A giant tennis ball: a bright yellow-green ball of fuzzy cubes with the white seam winding
 * round it. Built small and drawn twice the size.
 */
const look: LookModule = {
  id: 'prop.tennis-ball',
  look: {
    kind: 'prop',
    scale: 2,
    materials: {
      tennis: ['#93b410', '#c8e428', '#ecfa62'],
      tennis2: ['#7f9e0c', '#b2d01e', '#d8ee48'],
      seam: ['#c9cbb8', '#eceedd', '#ffffff'],
    },
    part: {
      w: 10,
      h: 10,
      layers: 10,
      smooth: true,
      fn: (x, y, z) => {
        const dz = z - 4.8;
        const r = Math.hypot(x, y, dz);
        if (r > 4.7) return null;
        // the seam: a wave that goes twice up and down on its way round the ball
        const wave = Math.sin(Math.atan2(y, x) * 2) * 2.3;
        if (r > 3.2 && Math.abs(dz - wave) < 0.7) return 'seam';
        return hash3(Math.floor(x / 0.67) + 30, Math.floor(y / 0.67) + 30, Math.floor(z / 0.67)) >
          0.72
          ? 'tennis2'
          : 'tennis';
      },
    },
  },
};
export default look;
