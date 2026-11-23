import type { LookModule } from '@demodogs/shared';
import { fowl, type Fowl } from '../../../src/beasts';

const F: Fowl = {
  r: 1.6,
  leg: 0.5,
  tall: 1.9,
  coat: 'crow',
  belly: 'feather',
  beak: 'beak',
  legs: 'beak',
};

/** A penguin: black back, white front, an orange beak, upright. */
const look: LookModule = {
  id: 'prop.penguins',
  look: { kind: 'prop', part: fowl(F, 0), alts: [fowl(F, 1)] },
};
export default look;
