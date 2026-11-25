import type { LookModule } from '@demodogs/shared';
import { TOY_LEAVES, blockTree } from '../toy-tree/look';

/** A low clump of leaves in blocks: one cube and a smaller one against it, on the lawn. */
const look: LookModule = {
  id: 'prop.toy-bush',
  look: {
    kind: 'prop',
    materials: TOY_LEAVES,
    scale: 2,
    part: blockTree(12, 8, 0, 0, 0, [
      [-0.8, -0.4, 0, 5.2, 3.2],
      [2.6, 1.6, 0, 3.4, 2.2],
    ]),
  },
};
export default look;
