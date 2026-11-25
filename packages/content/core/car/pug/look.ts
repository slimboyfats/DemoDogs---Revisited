import type { LookModule } from '@demodogs/shared';
import { carBody } from '../../../src/carshape';
import { CAR_CELL } from '../../../src/shapes';

/** Is (y, z) on a tube of radius r running along x at (cy, cz)? */
const tube = (y: number, z: number, cy: number, cz: number, r: number) =>
  Math.hypot(y - cy, z - cz) < r;

/** A dune buggy: a low open tub, two seats, an engine on the back and a roll cage of tubes. */
const body = carBody({
  a: 10.5,
  b: 5.4,
  r: 2.4,
  taper: [1.0, 0.4],
  deck: [
    [-10.5, 3.3],
    [4.6, 3.3],
    [6, 3.6],
    [10.5, 2.6],
  ],
  round: 1.3,
  arches: [
    { x: 7.0, r: 3.2 },
    { x: -6.8, r: 3.3 },
  ],
  head: [2.0, 3.8, 2.0, 2.8],
  tail: [3.0, 4.6, 2.2, 3.0],
  gaps: [4.7],
  extra: (x, y, z) => {
    const ay = Math.abs(y);
    // the cockpit: a hole in the tub with two seats in it
    if (x > -4.2 && x < 3.8 && ay < 4.3 && z > 1.6) {
      if (x < -0.6 && x > -3.6 && ay > 0.5 && ay < 3.7) {
        if (x < -2.6 && z < 5.2) return 'seat';
        if (z < 2.5) return 'seat';
      }
      if (z < 1.9) return 'under';
      // the cage: a hoop behind the seats, a hoop at the screen, rails joining them
      const rear = Math.abs(x + 4) < 0.45;
      const fore = Math.abs(x - 3.2 + (z - 3.3) * 0.5) < 0.45;
      if ((rear || fore) && z < 6.9 && (Math.abs(ay - 3.9) < 0.45 || z > 6.1)) return 'cage';
      if (tube(ay, z, 3.9, 6.5, 0.45) && x > -4 && x < 1.9) return 'cage';
      return null;
    }
    // the engine: a block with a cover and two stacks, open to the air
    if (x < -5 && x > -9.6 && ay < 3.1 && z > 3.2) {
      if (z < 4.4) return 'engine';
      if (z < 5.0 && ay < 2.2 && x > -8.8) return (((x * 2.5) | 0) & 1) === 0 ? 'chrome' : 'engine';
      if (z < 5.9 && Math.abs(ay - 1.2) < 0.5 && Math.abs(x + 6.4) < 0.5) return 'chrome';
      return null;
    }
    return undefined;
  },
  paint: (x, y, _z, skin) => (skin < 0.5 && x > 5.2 && Math.abs(y) < 0.9 ? 'trim' : undefined),
});

const look: LookModule = {
  id: 'car.pug',
  look: {
    kind: 'car',
    body: { ...CAR_CELL, smooth: true, fn: body },
    // a pair of spotlights on a bar
    top: {
      w: 4,
      h: 8,
      layers: 2,
      smooth: true,
      fn: (x, y, z) => {
        const ay = Math.abs(y);
        if (z < 0.6) return Math.abs(x) < 0.4 && ay < 3.6 ? 'cage' : null;
        return Math.hypot(x, ay - 1.9, (z - 1.2) * 1.2) < 1.1
          ? x > 0.5
            ? 'light'
            : 'chrome'
          : null;
      },
    },
  },
};
export default look;
