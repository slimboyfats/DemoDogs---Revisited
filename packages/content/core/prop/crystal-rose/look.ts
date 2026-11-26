import type { LookModule } from '@demodogs/shared';
import { GROTTO, crystal } from '../../../src/themes';

/** A cluster of pink crystal spikes, lit from inside. */
const look: LookModule = {
  id: 'prop.crystal-rose',
  look: { kind: 'prop', materials: GROTTO, part: crystal('roseglow', 'roseglow2') },
};
export default look;
