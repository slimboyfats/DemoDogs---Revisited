import type { LookModule } from '@demodogs/shared';
import type { Part } from '@demodogs/shared';

const LIT = ['turbohot', 'turbowarm', 'turbodim'] as const;

/** The tile with the light at step `pose` of its run from the paw out along the arrows. */
const tile = (pose: number): Part => ({
  w: 50,
  h: 36,
  layers: 1,
  fn: (px, py) => {
    // (drawn at 1.8 times the size it is laid out at, fine-edged)
    const x = px / 1.8;
    const y = py / 1.8;
    const lit = (n: number): string => LIT[(((n - pose) % 3) + 3) % 3]!;
    // the paw at the back, pointing along +x: a big pad and four toes, always lit, each with a
    // rim of deep blue so it stands out crisp on the road
    let paw = Math.hypot((x + 9.3) / 2.9, y / 3.9) - 1;
    for (const [tx, ty] of [
      [-5, -5.9],
      [-2.6, -2.2],
      [-2.6, 2.2],
      [-5, 5.9],
    ] as const)
      paw = Math.min(paw, (Math.hypot((x - tx) / 1.7, (y - ty) / 1.45) - 1) * 0.55);
    if (paw < 0) return 'turbohot';
    if (paw < 0.2) return 'pawrim';
    // two arrows ahead of it: the tip leads, the arms sweep back
    for (let n = 0; n < 2; n++) {
      const u = x - 4.5 - n * 5.5 + Math.abs(y) * 0.75;
      if (u > 0 && u < 2.9 && Math.abs(y) < 7.6) return lit(n);
    }
    return null;
  },
});

/** A paw boost tile: a blue paw print and two arrows painted on the road, the light running along them. */
const look: LookModule = {
  id: 'prop.paw-pad',
  look: {
    kind: 'prop',
    // (brighter than the game's other boost tiles: pale blue all over, the lit part near white)
    materials: {
      pawrim: ['#1456d8', '#1e6cf0', '#3a86ff'],
      turbodim: ['#2f92ff', '#4aaaff', '#74c2ff'],
      turbowarm: ['#5cbcff', '#84d2ff', '#b0e6ff'],
      turbohot: ['#b4eaff', '#d8f6ff', '#fcfcf4'],
    },
    part: tile(0),
    alts: [tile(1), tile(2)],
  },
};
export default look;
