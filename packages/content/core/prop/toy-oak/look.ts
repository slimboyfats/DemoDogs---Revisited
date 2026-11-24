import type { LookModule } from '@demodogs/shared';
import { TOY_LEAVES, toyTree } from '../toy-tree/look';

/** A great park oak of leafy cubes: a thick trunk and a crown as wide as the road. */
const look: LookModule = {
  id: 'prop.toy-oak',
  look: {
    kind: 'prop',
    materials: TOY_LEAVES,
    part: toyTree(30, 30, 3, 11, 3, [
      [0, 0, 19, 10],
      [-6, 3.5, 16.5, 7.5],
      [6, -3, 16.5, 7.5],
      [-3.5, -6, 17, 7],
      [4, 6, 17, 7],
      [0, 0, 24, 6.5],
    ]),
  },
};
export default look;
