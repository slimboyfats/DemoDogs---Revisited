import type { LookModule } from '@demodogs/shared';
import { GROTTO, crystal } from '../../../src/themes';

/** A cluster of blue crystal spikes, lit from inside. */
const look: LookModule = {
  id: 'prop.crystal',
  look: { kind: 'prop', materials: GROTTO, part: crystal('crystglow', 'crystglow2') },
};
export default look;
