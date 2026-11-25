import type { LookModule } from '@demodogs/shared';
import { TOY_LEAVES, toyTree } from '../toy-tree/look';

/**
 * A great park oak of leafy cubes: a thick rooted trunk and a crown of dozens of small lumps, as wide as the
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
    part: toyTree(38, 30, 3.6, 9, 1.2, [
      [0, 0, 17, 6.5],
      [2.9, -0.5, 23.5, 3.1],
      [-3.5, 2.5, 23.2, 3.2],
      [2.1, -5.2, 22.9, 3.7],
      [4.3, 5.3, 22.6, 3.5],
      [-8.2, 0.1, 22.3, 3.0],
      [5.7, -5.1, 21.9, 3.2],
      [-2.0, 9.5, 21.6, 3.4],
      [-5.9, -6.9, 21.3, 4.1],
      [10.2, 0.9, 21.0, 3.4],
      [-9.6, 2.9, 20.6, 3.7],
      [4.7, -10.0, 20.3, 4.0],
      [2.6, 9.9, 20.0, 3.0],
      [-7.9, -8.0, 19.7, 3.1],
      [11.6, 0.6, 19.4, 3.8],
      [-8.3, 7.4, 19.0, 3.3],
      [1.1, -10.9, 18.7, 3.8],
      [11.1, 5.5, 18.4, 3.7],
      [-12.4, -2.9, 18.1, 3.5],
      [6.4, -9.2, 17.7, 3.5],
      [-0.6, 11.0, 17.4, 4.0],
      [-7.9, -9.6, 17.1, 3.2],
      [10.8, -0.2, 16.8, 3.3],
      [-8.5, 7.9, 16.5, 3.4],
      [5.2, -11.5, 16.1, 3.1],
      [5.9, 9.0, 15.8, 3.7],
      [-8.9, -6.0, 15.5, 3.8],
    ]),
  },
};
export default look;
