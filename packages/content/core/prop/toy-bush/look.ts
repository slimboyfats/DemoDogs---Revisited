import type { LookModule } from '@demodogs/shared';
import { TOY_LEAVES, toyTree } from '../toy-tree/look';

/** A low clump of leafy cubes, three lumps of it, sitting on the lawn with no trunk to see. */
const look: LookModule = {
  id: 'prop.toy-bush',
  look: {
    kind: 'prop',
    materials: TOY_LEAVES,
    scale: 2,
    part: toyTree(12, 8, 0, -9, 1.4, [
      [0.4, 0.2, 2.8, 3.6],
      [-2.4, 1.4, 1.8, 2.8],
      [2, -2, 1.8, 2.7],
    ]),
  },
};
export default look;
