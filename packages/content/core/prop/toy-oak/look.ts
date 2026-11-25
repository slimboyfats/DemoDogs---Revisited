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
    part: toyTree(34, 36, 3.2, 15, 1.2, [
      [0, 0, 23, 7.5],
      [2.4, 0.0, 30.4, 3.7],
      [-3.0, 2.8, 30.0, 3.8],
      [0.5, -5.2, 29.6, 3.8],
      [3.7, 4.8, 29.2, 3.9],
      [-6.7, -1.2, 28.8, 3.8],
      [6.2, -4.0, 28.4, 3.9],
      [-2.1, 7.7, 28.0, 3.1],
      [-3.9, -7.4, 27.7, 3.5],
      [8.2, 3.0, 27.3, 3.9],
      [-8.4, 3.5, 26.9, 3.7],
      [4.0, -8.5, 26.5, 3.9],
      [2.9, 9.2, 26.1, 3.2],
      [-8.6, -5.0, 25.7, 3.5],
      [9.9, -2.2, 25.3, 3.3],
      [-5.9, 8.4, 24.9, 3.6],
      [-1.3, -10.3, 24.5, 3.6],
      [8.0, 6.8, 24.1, 3.1],
      [-10.5, 0.4, 23.7, 3.3],
      [7.5, -7.5, 23.3, 3.4],
      [-0.5, 10.6, 22.9, 3.9],
      [-6.8, -8.1, 22.6, 3.8],
      [10.4, 1.4, 22.2, 3.2],
      [-8.6, 6.0, 21.8, 3.8],
      [2.3, -10.1, 21.4, 3.2],
      [5.1, 8.9, 21.0, 3.7],
      [-9.6, -3.1, 20.6, 3.2],
      [8.9, -4.1, 20.2, 3.1],
      [-3.7, 8.9, 19.8, 3.9],
      [-3.2, -8.8, 19.4, 3.3],
      [8.0, 4.2, 19.0, 3.3],
    ]),
  },
};
export default look;
