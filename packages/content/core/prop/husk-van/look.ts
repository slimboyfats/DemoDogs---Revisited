import type { LookModule } from '@demodogs/shared';
import { PALETTE } from '../../../src/palette';
import { CAR_CELL } from '../../../src/shapes';
import { bruiserBody } from '../../car/bruiser/look';

/** The Bruiser's body, rusted through. */
const look: LookModule = {
  id: 'prop.husk-van',
  look: {
    kind: 'prop',
    part: { ...CAR_CELL, fn: bruiserBody },
    materials: {
      paint: PALETTE.rust2!,
      glass: PALETTE.under!,
      light: PALETTE.rust!,
      tail: PALETTE.rust!,
      trim: PALETTE.rust!,
      bumper: PALETTE.rust!,
    },
  },
};
export default look;
