import type { LookModule } from '@demodogs/shared';
import { bird, type Wing } from '../../../src/beasts';

const W: Wing = { len: 4.2, span: 4.6, coat: 'crow', beak: 'bumper' };

/** A crow: black all over, a grey beak. */
const look: LookModule = {
  id: 'prop.crows',
  look: { kind: 'prop', part: bird(W, 'stand'), alts: [bird(W, 'up'), bird(W, 'down')] },
};
export default look;
