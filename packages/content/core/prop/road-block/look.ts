import type { LookModule } from '@demodogs/shared';
import { blockPart } from '../block/look';

/** The bowl's concrete block stood beside a road, where it is a real barrier (see the manifest). */
const look: LookModule = { id: 'prop.road-block', look: { kind: 'prop', part: blockPart } };
export default look;
