import type { LookModule } from '@demodogs/shared';
import type { Part } from '@demodogs/shared';

/** The plate with the light at step `pose` of its run along the arrows. */
const plate = (pose: number): Part => ({
  w: 28,
  h: 22,
  layers: 1,
  fn: (x, y) => {
    if (Math.abs(x) > 14.0 || Math.abs(y) > 11.0) return null;
    // a hazard kerb down each side
    if (Math.abs(y) > 9.6) return Math.floor((x + 40) / 2.5) % 2 ? 'padrim' : 'black';
    // chevrons pointing along +x: the tip leads, the arms sweep back
    const u = x + Math.abs(y) * 0.8 + 40;
    if (u % 6.5 < 3.58) {
      const k = (((Math.floor(u / 6.5) - pose) % 3) + 3) % 3;
      return k === 0 ? 'turbohot' : k === 1 ? 'turbowarm' : 'turbodim';
    }
    return 'padbase';
  },
});

/** A turbo tile: four blue-white chevrons the light runs along. */
const look: LookModule = {
  id: 'prop.turbo-pad',
  look: { kind: 'prop', part: plate(0), alts: [plate(1), plate(2)] },
};
export default look;
