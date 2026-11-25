import type { LookModule } from '@demodogs/shared';
import { TOY_LEAVES, blockTree } from '../toy-tree/look';

/**
 * A fir built of blocks: a tall square pyramid of leaves on a thin square trunk, drawing in a
 * little every layer, so its four faces are flat and clean.
 */
const look: LookModule = {
  id: 'prop.toy-tree-big',
  look: {
    kind: 'prop',
    materials: TOY_LEAVES,
    scale: 3,
    part: blockTree(20, 22, 1, 5, 0.6, [[0, 0, 4, 21.5, 7.4]], 0.4 / 3, 1 / 3),
  },
};
export default look;
