import type { LookModule } from '@demodogs/shared';
import { BOX, BOX_TONES, box } from '../../../src/docks';

/** A red shipping container standing on the quay. */
const look: LookModule = {
  id: 'prop.container-red',
  look: {
    kind: 'prop',
    materials: BOX_TONES,
    part: { ...BOX, smooth: true, fn: (x, y, z) => box(x, y, z, 'boxr', 'boxr2') },
  },
};
export default look;
