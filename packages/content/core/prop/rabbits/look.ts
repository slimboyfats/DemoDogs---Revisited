import type { LookModule } from '@demodogs/shared';
import { beastLook, type Beast } from '../../../src/beasts';

const B: Beast = {
  len: 3.4,
  wid: 2.2,
  deep: 2,
  leg: 0.8,
  head: 1,
  neck: 0.6,
  coat: 'fur',
  face: 'fur',
  legs: 'fur',
  ears: 'fur',
  tail: 'paintw',
};

/** A rabbit: small, grey-brown, long ears and a white scut. */
const look: LookModule = {
  id: 'prop.rabbits',
  look: beastLook(B),
};
export default look;
