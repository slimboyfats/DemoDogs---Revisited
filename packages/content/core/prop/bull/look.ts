import type { LookModule } from '@demodogs/shared';
import { beastLook, type Beast } from '../../../src/beasts';

const B: Beast = {
  len: 13,
  wid: 6.4,
  deep: 6,
  leg: 2.6,
  head: 2.3,
  neck: 0.2,
  coat: 'hide2',
  face: 'hide2',
  legs: 'hide2',
  ears: 'feather',
  tail: 'hide2',
  horn: 2.6,
};

/** A bull: black, heavy in the shoulder, wide white horns. */
const look: LookModule = {
  id: 'prop.bull',
  look: beastLook(B),
};
export default look;
