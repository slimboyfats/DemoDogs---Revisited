import type { LookModule } from '@demodogs/shared';
import { BOX, BOX_TONES, box } from '../../../src/docks';

/** A teal container stacked on top of another: the same box, a container's height up. */
const look: LookModule = {
  id: 'prop.container-teal-top',
  look: {
    kind: 'prop',
    materials: BOX_TONES,
    part: {
      ...BOX,
      layers: BOX.layers * 2,
      smooth: true,
      fn: (x, y, z) => box(x, y, z - BOX.layers, 'boxt', 'boxt2'),
    },
  },
};
export default look;
