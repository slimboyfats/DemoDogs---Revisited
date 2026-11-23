import type { LookModule } from '@demodogs/shared';
import { beastLook, type Beast } from '../../../src/beasts';

const B: Beast = {
  len: 7.6,
  wid: 4.2,
  deep: 4.2,
  leg: 2.2,
  head: 1.6,
  neck: 0.9,
  coat: 'fawn',
  face: 'hide',
  legs: 'hide',
  ears: 'bark2',
  tail: 'fawn',
  horn: 1.5,
  woolly: true,
};

/** A ram: shaggy and tan, dark curled horns. */
const look: LookModule = {
  id: 'prop.ram',
  look: beastLook(B),
};
export default look;
