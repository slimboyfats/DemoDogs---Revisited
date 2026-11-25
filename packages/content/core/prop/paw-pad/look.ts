import type { LookModule } from '@demodogs/shared';
import type { Part } from '@demodogs/shared';

const LIT = ['turbohot', 'turbowarm', 'turbodim'] as const;

/** The tile with the light at step `pose` of its run from the paw out along the arrows. */
const tile = (pose: number): Part => ({
  w: 28,
  h: 20,
  layers: 1,
  fn: (x, y) => {
    const lit = (n: number): string => LIT[(((n - pose) % 3) + 3) % 3]!;
    // the paw at the back: a big pad and four toes, pointing along +x
    if (Math.hypot((x + 9) / 3.4, y / 4.2) < 1) return lit(0);
    for (const [tx, ty] of [
      [-4.6, -5.6],
      [-2.4, -2],
      [-2.4, 2],
      [-4.6, 5.6],
    ] as const)
      if (Math.hypot(x - tx, y - ty) < 1.75) return lit(0);
    // two arrows ahead of it: the tip leads, the arms sweep back
    for (let n = 0; n < 2; n++) {
      const u = x - 4.5 - n * 5.5 + Math.abs(y) * 0.75;
      if (u > 0 && u < 2.9 && Math.abs(y) < 7.6) return lit(n + 1);
    }
    return null;
  },
});

/** A paw boost tile: a blue paw print and two arrows painted on the road, the light running along them. */
const look: LookModule = {
  id: 'prop.paw-pad',
  look: {
    kind: 'prop',
    scale: 1.8,
    // (brighter than the game's other boost tiles: pale blue all over, the lit part near white)
    materials: {
      turbodim: ['#2f92ff', '#4aaaff', '#74c2ff'],
      turbowarm: ['#5cbcff', '#84d2ff', '#b0e6ff'],
      turbohot: ['#b4eaff', '#d8f6ff', '#fcfcf4'],
    },
    part: tile(0),
    alts: [tile(1), tile(2)],
  },
};
export default look;
