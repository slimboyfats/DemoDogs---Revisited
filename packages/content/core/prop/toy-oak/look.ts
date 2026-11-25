import type { LookModule } from '@demodogs/shared';
import { TOY_LEAVES, toyTree } from '../toy-tree/look';

/**
 * A great park oak of leafy cubes: a thick rooted trunk and a crown of many lumps, as wide as the
 * road and taller than anything else in the park. Built small and drawn six times the size.
 */
const look: LookModule = {
  id: 'prop.toy-oak',
  look: {
    kind: 'prop',
    materials: TOY_LEAVES,
    scale: 6,
    part: toyTree(34, 32, 3.3, 11, 1.2, [
      [0, 0, 20, 7.6],
      [9.4, 1.9, 15.5, 5.0],
      [4.4, 8.5, 16.7, 5.0],
      [-4.0, 8.7, 15.5, 5.0],
      [-9.3, 2.4, 16.7, 5.0],
      [-7.6, -5.8, 15.5, 5.0],
      [-0.2, -9.6, 16.7, 5.0],
      [7.4, -6.2, 15.5, 5.0],
      [4.9, 4.1, 21.5, 4.8],
      [-2.4, 5.9, 22.5, 4.8],
      [-6.4, -0.5, 21.5, 4.8],
      [-1.5, -6.2, 22.5, 4.8],
      [5.4, -3.4, 21.5, 4.8],
      [0, 0, 27, 5],
      [-4, 2.5, 25.5, 4],
      [4, -3, 25.5, 4],
    ]),
  },
};
export default look;
