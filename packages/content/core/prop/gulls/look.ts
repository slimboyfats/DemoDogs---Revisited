import type { LookModule } from '@demodogs/shared';
import { bird, type Wing } from '../../../src/beasts';

const W: Wing = { len: 4.4, span: 5.4, coat: 'feather', tip: 'crow', beak: 'beak' };

/** A gull: white, grey wings with black tips, a yellow beak. */
const look: LookModule = {
  id: 'prop.gulls',
  look: { kind: 'prop', part: bird(W, 'stand'), alts: [bird(W, 'up'), bird(W, 'down')] },
};
export default look;
