import type { LookModule } from '@demodogs/shared';
import { rr } from '../../../src/shapes';

/** The crusher's bed: a ribbed steel floor in a hazard-striped frame, flush with the ground. */
const look: LookModule = {
  id: 'prop.crusher',
  look: {
    kind: 'prop',
    part: {
      w: 28,
      h: 22,
      layers: 2,
      smooth: true,
      fn: (x, y, z) => {
        if (!rr(x, y, 13.5, 10.5, 1)) return null;
        const edge = !rr(x, y, 11.6, 8.6, 0.5);
        if (edge) {
          if (z > 1.6) return null;
          // diagonal yellow and black stripes round the frame
          return Math.floor((x + y) * 0.5) % 2 ? 'hazard' : 'black';
        }
        if (z > 1) return null;
        // ribs across the floor, scuffed bright where cars have run over them
        if (Math.abs(((x + 30) % 2.4) - 1.2) < 0.35) return 'chrome';
        return 'bumper';
      },
    },
  },
};
export default look;
