import type { LookModule } from '@demodogs/shared';
import { beast, type Beast } from '../../../src/beasts';

const B: Beast = {
  len: 9,
  wid: 3.6,
  deep: 3.8,
  leg: 3.6,
  head: 1.4,
  neck: 2.2,
  coat: 'fawn',
  face: 'fawn',
  legs: 'hide',
  ears: 'bark2',
  tail: 'paintw',
};

/** A deer: fawn, long legs, a white tail, small antlers. */
const look: LookModule = {
  id: 'prop.deer',
  look: { kind: 'prop', part: beast(B, 0), alts: [beast(B, 1)] },
};
export default look;
