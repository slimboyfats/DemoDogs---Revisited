import type { LookModule } from '@demodogs/shared';
import { carBody } from '../../../src/carshape';
import { toyTruck } from '../../../src/toytruck';
import { CAR_CELL } from '../../../src/shapes';

/** A muscle car: low and long, twin stripes nose to tail, a fastback cabin set well back. */
const body = carBody({
  a: 12,
  b: 5.6,
  r: 2.2,
  taper: [0.5, 0.4],
  deck: [
    [-12, 4.0],
    [-10.5, 4.5],
    [1.6, 4.5],
    [3, 4.3],
    [12, 3.7],
  ],
  round: 1.6,
  arches: [
    { x: 7.6, r: 3.3 },
    { x: -7.4, r: 3.4 },
  ],
  cabin: { x0: -7.4, x1: 2.6, roof: 6.5, inset: 0.7, lean: 0.9, rakeF: 3.0, rakeR: 3.6 },
  head: [2.4, 4.6, 2.5, 3.3],
  tail: [1.6, 5.0, 3.0, 3.7],
  grille: 2.2,
  gaps: [3.1, -1.2],
  // a bonnet scoop
  extra: (x, y, z, top) =>
    x > 4.2 && x < 7.4 && Math.abs(y) < 1.5 && z > top && z < top + 0.75
      ? x > 6.9
        ? 'grille'
        : 'paint'
      : undefined,
  paint: (_x, y, _z, skin) => {
    const ay = Math.abs(y);
    return skin < 0.5 && ay > 0.45 && ay < 1.7 ? 'trim' : undefined;
  },
});

const look: LookModule = {
  id: 'car.whippet',
  look: {
    kind: 'car',
    body: { ...CAR_CELL, smooth: true, fn: body },
    toy: {
      ...CAR_CELL,
      smooth: true,
      fn: toyTruck({
        a: 12,
        b: 5.6,
        well: 3.2,
        axles: [7.6, -7.4],
        hood: 4.5,
        nose: 4,
        cab: { x0: -7, x1: 2.2, roof: 6.6, rake: 2.2, rakeR: 2.6 },
      }),
    },
    // a rear wing on two posts
    top: {
      w: 3,
      h: 12,
      layers: 3,
      smooth: true,
      fn: (x, y, z) =>
        z < 2.1
          ? Math.abs(Math.abs(y) - 3.6) < 0.5 && Math.abs(x) < 0.6
            ? 'gap'
            : null
          : Math.abs(y) < 5.5 && Math.abs(x) < 1.4 && z < 2.8
            ? Math.abs(y) > 4.9
              ? 'trim'
              : 'paint'
            : null,
    },
  },
};
export default look;
