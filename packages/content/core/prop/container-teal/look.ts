import { withFinish, type LookModule } from '@demodogs/shared';
import { BOX, BOX_TONES, box } from '../../../src/docks';

/** A teal shipping container standing on the quay. */
const look: LookModule = {
  id: 'prop.container-teal',
  look: {
    kind: 'prop',
    materials: BOX_TONES,
    // (bare painted steel: every face of it glints)
    part: withFinish(
      { ...BOX, smooth: true, fn: (x, y, z) => box(x, y, z, 'boxt', 'boxt2') },
      (_x, _y, _z, m) => (m === 'black' ? null : 'metal'),
    ),
  },
};
export default look;
