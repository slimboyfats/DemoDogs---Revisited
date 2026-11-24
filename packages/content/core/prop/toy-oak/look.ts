import type { LookModule } from '@demodogs/shared';
import { TOY_LEAVES, toyTree } from '../toy-tree/look';

/** A great park oak of leafy cubes: a thick trunk and a crown as wide as the road. */
const look: LookModule = {
  id: 'prop.toy-oak',
  look: {
    kind: 'prop',
    materials: TOY_LEAVES,
    part: toyTree(36, 34, 3, 13, 3, [
      [0, 0, 22, 11.5],
      [-7.5, 4, 19, 8.5],
      [7.5, -3.5, 19, 8.5],
      [-4, -7.5, 19.5, 8],
      [5, 7.5, 19.5, 8],
      [0, 0, 27.5, 7.5],
    ]),
  },
};
export default look;
