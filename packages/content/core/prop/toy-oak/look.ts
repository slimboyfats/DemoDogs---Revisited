import type { LookModule } from '@demodogs/shared';
import { TOY_LEAVES, blockTree } from '../toy-tree/look';

/**
 * A great park oak of leafy cubes: a thick square trunk and a crown of great blocks, as wide as the
 * road and taller than anything else in the park. Built small and drawn six times the size.
 */
const look: LookModule = {
  id: 'prop.toy-oak',
  look: {
    kind: 'prop',
    // (an old tree's bark: darker than the young ones')
    materials: {
      ...TOY_LEAVES,
      toybark: ['#3c2412', '#553418', '#6c4420'],
      toybark2: ['#28160a', '#3a2210', '#4e3018'],
    },
    scale: 6,
    part: blockTree(38, 30, 3.4, 13, 2.2, [
      [0, 0, 12, 24, 15],
      [-2, 1, 24, 28.5, 10],
      [-13, -9, 9, 15, 5],
      [12, 10, 8.5, 14, 5.5],
    ]),
  },
};
export default look;
