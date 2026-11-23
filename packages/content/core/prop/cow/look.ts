import type { LookModule } from '@demodogs/shared';
import { beast, type Beast } from '../../../src/beasts';

const B: Beast = {
  len: 12,
  wid: 5.6,
  deep: 5.4,
  leg: 2.6,
  head: 2,
  neck: 0.3,
  coat: 'feather',
  patch: 'hide2',
  face: 'feather',
  legs: 'feather',
  ears: 'bark',
  tail: 'hide2',
};

/** A cow: white with black patches, horns, a pink nose. */
const look: LookModule = {
  id: 'prop.cow',
  look: { kind: 'prop', part: beast(B, 0), alts: [beast(B, 1)] },
};
export default look;
