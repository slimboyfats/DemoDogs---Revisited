import type { LookModule } from '@demodogs/shared';
import { fowl, type Fowl } from '../../../src/beasts';

const F: Fowl = {
  r: 1.7,
  leg: 1,
  tall: 1,
  coat: 'feather',
  beak: 'beak',
  comb: 'comb',
  legs: 'beak',
};

/** A hen: white, a red comb, a yellow beak. */
const look: LookModule = {
  id: 'prop.chickens',
  look: { kind: 'prop', part: fowl(F, 0), alts: [fowl(F, 1)] },
};
export default look;
