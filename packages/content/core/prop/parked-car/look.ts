import type { LookModule } from '@demodogs/shared';
import { PALETTE } from '../../../src/palette';
import { CAR_CELL } from '../../../src/shapes';
import { bruiserBody } from '../../car/bruiser/look';

/** A family saloon in faded teal, left at the kerb, lights off. */
const look: LookModule = {
  id: 'prop.parked-car',
  look: {
    kind: 'prop',
    part: { ...CAR_CELL, smooth: true, fn: bruiserBody },
    materials: {
      paint: ['#1f4f52', '#2f7478', '#6fb3b5'],
      paint2: ['#173b3d', '#235658', '#4f8a8c'],
      gap: ['#0c1d1e', '#132c2d', '#1e4243'],
      trim: PALETTE.chrome!,
      light: PALETTE.plate!,
    },
  },
};
export default look;
