import type { LookModule } from '@demodogs/shared';
import { BAY } from '../../../src/themes';

/** A length of boardwalk, +x along it: planks laid across, a beam down each edge, nail heads. */
const look: LookModule = {
  id: 'prop.boardwalk',
  look: {
    kind: 'prop',
    materials: BAY,
    part: {
      w: 40,
      h: 56,
      layers: 2,
      fn: (x, y, z) => {
        const ay = Math.abs(y);
        if (ay > 28) return null;
        // the beams stand a little proud of the planks
        if (ay > 25.2) return 'plank2';
        if (z > 0) return null;
        const u = (((x + 60) % 5) + 5) % 5;
        if (u < 0.55) return 'plankgap';
        // every other plank is a darker board, and each has a nail near the beams
        if (ay > 22.6 && ay < 23.6 && u > 2.2 && u < 3.2) return 'plankgap';
        return Math.floor((x + 60) / 5) % 3 === 0 ? 'plank2' : 'plank';
      },
    },
  },
};
export default look;
