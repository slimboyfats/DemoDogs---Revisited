import type { LookModule } from '@demodogs/shared';
import { PALETTE } from '../../../src/palette';
import { CAR_CELL } from '../../../src/shapes';
import { muttBody } from '../../car/mutt/look';

/** The Mutt's body in rust, glass and lights gone dark. */
export const RUST = {
  paint: PALETTE.rust!,
  glass: PALETTE.under!,
  light: PALETTE.rust2!,
  tail: PALETTE.rust2!,
  trim: PALETTE.rust2!,
  bumper: PALETTE.rust2!,
  glasshi: PALETTE.under!,
  gap: PALETTE.black!,
  paint2: PALETTE.rust2!,
  chrome: PALETTE.rust2!,
  grille: PALETTE.black!,
  seat: PALETTE.black!,
  cone: PALETTE.rust2!,
};

const look: LookModule = {
  id: 'prop.husk',
  look: { kind: 'prop', part: { ...CAR_CELL, smooth: true, fn: muttBody }, materials: RUST },
};
export default look;
