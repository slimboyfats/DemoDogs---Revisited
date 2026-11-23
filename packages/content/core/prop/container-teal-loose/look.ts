import type { LookModule } from '@demodogs/shared';
import { BOX, BOX_TONES, box } from '../../../src/docks';

/** A teal container that has come off its stack, lying loose. */
const look: LookModule = {
  id: 'prop.container-teal-loose',
  look: {
    kind: 'prop',
    materials: BOX_TONES,
    part: { ...BOX, smooth: true, fn: (x, y, z) => box(x, y, z, 'boxt', 'boxt2') },
  },
};
export default look;
