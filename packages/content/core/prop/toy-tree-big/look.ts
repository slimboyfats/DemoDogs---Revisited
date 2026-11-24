import type { LookModule } from '@demodogs/shared';
import { TOY_LEAVES, toyTree } from '../toy-tree/look';

/** A full-grown park tree of leafy cubes: the toy tree's big brother, half as tall again. */
const look: LookModule = {
  id: 'prop.toy-tree-big',
  look: {
    kind: 'prop',
    materials: TOY_LEAVES,
    scale: 3,
    part: toyTree(20, 22, 1.5, 7, 1.4, [
      [0, 0, 14, 6.4],
      [-3.6, 2.6, 11.5, 4.8],
      [3.6, -2.4, 11.5, 4.8],
      [2.4, 3.4, 12.5, 4.2],
      [-2.4, -3.2, 12.5, 4.2],
      [0, 0, 17.5, 4.2],
    ]),
  },
};
export default look;
