import type { LookModule } from '@demodogs/shared';
import { beastLook, type Beast } from '../../../src/beasts';

const B: Beast = {
  len: 14,
  wid: 6,
  deep: 6.4,
  leg: 4.6,
  head: 2.4,
  neck: 1.2,
  coat: 'bark',
  face: 'bark2',
  legs: 'fawn',
  ears: 'fawn',
  tail: 'bark',
  horn: 4,
};

/** A moose: dark, tall on pale legs, broad antlers. */
const look: LookModule = {
  id: 'prop.moose',
  look: beastLook(B),
};
export default look;
