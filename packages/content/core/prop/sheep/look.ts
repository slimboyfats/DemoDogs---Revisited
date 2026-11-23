import type { LookModule } from '@demodogs/shared';
import { beast, type Beast } from '../../../src/beasts';

const B: Beast = {
  len: 7,
  wid: 4.6,
  deep: 4.2,
  leg: 1.6,
  head: 1.5,
  neck: 0.4,
  coat: 'wool',
  face: 'hide2',
  legs: 'hide2',
  ears: 'hide2',
  woolly: true,
};

/** A sheep: a lumpy white fleece on black legs, a black face. */
const look: LookModule = {
  id: 'prop.sheep',
  look: { kind: 'prop', part: beast(B, 0), alts: [beast(B, 1)] },
};
export default look;
