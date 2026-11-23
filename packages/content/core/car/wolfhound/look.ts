import type { LookModule } from '@demodogs/shared';
import { carBody } from '../../../src/carshape';
import { CAR_CELL } from '../../../src/shapes';

/** A wedge: a nose that starts at the road and climbs to a glass canopy, wide haunches behind. */
const body = carBody({
  a: 12.5,
  b: 6,
  r: 2.6,
  taper: [1.3, 0.2],
  deck: [
    [-12.5, 4.3],
    [-11, 4.8],
    [-4.5, 4.7],
    [1, 4.0],
    [12.5, 2.1],
  ],
  round: 1.8,
  arches: [
    { x: 7.8, r: 3.2 },
    { x: -7.6, r: 3.5 },
  ],
  cabin: { x0: -5.4, x1: 4.6, roof: 6.0, inset: 1.5, lean: 0.9, rakeF: 4.2, rakeR: 2.6 },
  head: [2.6, 4.8, 1.5, 2.1],
  tail: [0, 5.2, 3.4, 3.9],
  gaps: [-5.8],
  extra: (x, y, z, top) => {
    const ay = Math.abs(y);
    // air intakes in the flanks, ahead of the rear wheels
    if (x > -4.6 && x < -2.2 && ay > 5.0 && z > 2.3 && z < 3.8) return 'grille';
    // louvres over the engine
    if (x < -6.2 && x > -10.6 && ay < 2.6 && z > top - 0.35 && z <= top)
      return (((x * 1.6) | 0) & 1) === 0 ? 'grille' : undefined;
    return undefined;
  },
  paint: (x, y, _z, skin) => (skin < 0.5 && Math.abs(y) < 0.5 && x > 4.8 ? 'trim' : undefined),
});

const look: LookModule = {
  id: 'car.wolfhound',
  look: {
    kind: 'car',
    body: { ...CAR_CELL, smooth: true, fn: body },
    // an engine cover with an intake scoop
    top: {
      w: 7,
      h: 8,
      layers: 2,
      smooth: true,
      fn: (x, y, z) =>
        Math.abs(x) < 2.6 - z * 0.5 && Math.abs(y) < 2.2 - z * 0.4
          ? x > 1.7 - z * 0.5
            ? 'grille'
            : 'paint2'
          : null,
    },
  },
};
export default look;
