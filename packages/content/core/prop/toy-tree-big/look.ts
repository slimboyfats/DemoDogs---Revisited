import type { LookModule } from '@demodogs/shared';
import { TOY_LEAVES, blockTree } from '../toy-tree/look';

/** A fir built of blocks: a tall stepped pyramid of leaves on a thin square trunk. */
const look: LookModule = {
  id: 'prop.toy-tree-big',
  look: {
    kind: 'prop',
    materials: TOY_LEAVES,
    scale: 3,
    part: blockTree(20, 22, 1, 5, 0.6, [[0, 0, 4, 21.5, 7.4]], 0.4, 1),
  },
};
export default look;
