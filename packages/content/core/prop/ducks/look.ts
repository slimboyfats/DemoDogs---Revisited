import type { LookModule } from '@demodogs/shared';
import { fowl, type Fowl } from '../../../src/beasts';

const F: Fowl = {
  r: 1.6,
  leg: 0.7,
  tall: 0.95,
  coat: 'paintw',
  beak: 'pumpkin',
  legs: 'pumpkin',
};

/** A duck: white and round, an orange beak and orange feet. */
const look: LookModule = {
  id: 'prop.ducks',
  look: { kind: 'prop', part: fowl(F, 0), alts: [fowl(F, 1)] },
};
export default look;
