import type { LookModule } from '@demodogs/shared';
import { TOY_LEAVES, toyTree } from '../toy-tree/look';

/**
 * A great park oak of leafy cubes: a thick rooted trunk and a crown of many lumps, as wide as the
 * road and taller than anything else in the park. Built small and drawn four times the size.
 */
const look: LookModule = {
  id: 'prop.toy-oak',
  look: {
    kind: 'prop',
    materials: TOY_LEAVES,
    scale: 4,
    part: toyTree(34, 32, 2.3, 9, 1.2, [
      [0, 0, 20, 9.2],
      [-7.5, 3, 16, 6.2],
      [7.5, -3, 16, 6.2],
      [-3.5, -7.5, 16.5, 6],
      [3.5, 7.5, 16.5, 6],
      [-6, -4, 21, 5.2],
      [6, 4, 21, 5.2],
      [0, 0, 26, 5.6],
      [-9.5, -2.5, 13.5, 4],
      [9.5, 2.5, 13.5, 4],
      [1, -9.5, 13.5, 4],
      [-1, 9.5, 13.5, 4],
    ]),
  },
};
export default look;
