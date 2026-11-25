import type { LookModule } from '@demodogs/shared';
import { TOY_LEAVES, toyTree } from '../toy-tree/look';

/**
 * A great park oak of leafy cubes: a thick rooted trunk and a crown of many lumps, as wide as the
 * road and taller than anything else in the park. Built small and drawn five times the size.
 */
const look: LookModule = {
  id: 'prop.toy-oak',
  look: {
    kind: 'prop',
    materials: TOY_LEAVES,
    scale: 5,
    part: toyTree(34, 32, 2.5, 11, 1.2, [
      [0, 0, 21.5, 9.2],
      [-7.5, 3, 17.5, 6.2],
      [7.5, -3, 17.5, 6.2],
      [-3.5, -7.5, 18, 6],
      [3.5, 7.5, 18, 6],
      [-6, -4, 22.5, 5.2],
      [6, 4, 22.5, 5.2],
      [0, 0, 27.5, 5.6],
      [-9.5, -2.5, 15, 4],
      [9.5, 2.5, 15, 4],
      [1, -9.5, 15, 4],
      [-1, 9.5, 15, 4],
    ]),
  },
};
export default look;
