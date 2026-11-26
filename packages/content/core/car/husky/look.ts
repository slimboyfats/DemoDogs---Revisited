import { withFinish, type LookModule, type ShapeFn } from '@demodogs/shared';
import { carBody } from '../../../src/carshape';
import { CAR_CELL } from '../../../src/shapes';

const A = 11.3;

/** A rally estate on tall tyres: a bull bar on the nose, white cladding below a stripe, a long roof. */
export const huskyBody: ShapeFn = carBody({
  a: A,
  b: 5.9,
  r: 2.0,
  taper: [0.5, 0.2],
  deck: [
    [-A, 4.7],
    [-10.4, 5.0],
    [4.2, 5.0],
    [5.4, 4.8],
    [A, 4.3],
  ],
  round: 1.3,
  arches: [
    { x: 7.0, r: 3.5 },
    { x: -7.1, r: 3.5 },
  ],
  cabin: {
    x0: -9.8,
    x1: 4.4,
    roof: 8.0,
    inset: 0.45,
    lean: 0.7,
    rakeF: 2.7,
    rakeR: 1.3,
    pillar: -2.2,
  },
  head: [2.5, 4.9, 2.8, 3.8],
  tail: [3.6, 5.3, 3.2, 4.4],
  grille: 2.3,
  gaps: [4.9, 1.2, -5.6],
  handles: [-1.7, -5.2],
  exhausts: [3.2],
  extra: (x, y, z) => {
    const ay = Math.abs(y);
    // the bull bar: two uprights and two hoops across them, standing off the bumper
    if (x > A + 0.1 && x < A + 0.75 && ay < 4.3 && z > 1.2 && z < 4.5) {
      if (Math.abs(ay - 2.3) < 0.3) return 'chrome';
      if (Math.abs(z - 4.2) < 0.3 || Math.abs(z - 2.3) < 0.28) return 'chrome';
      return null;
    }
    if (x > A - 0.5 && x <= A + 0.1 && Math.abs(ay - 2.3) < 0.3 && Math.abs(z - 2.3) < 0.28)
      return 'chrome';
    // mud flaps behind each wheel
    if (ay > 4.2 && ay < 5.6 && z < 1.6 && z > 0.2)
      for (const fx of [3.2, -10.7]) if (Math.abs(x - fx) < 0.22) return 'rubber';
    return undefined;
  },
  paint: (x, _y, z, skin) => {
    if (z > 7.4) return Math.abs(x + 2.7) < 4.4 ? 'paintw' : undefined;
    if (z < 3.0) return 'paintw';
    if (skin < 0.45 && z < 3.45) return 'trim';
    return undefined;
  },
});

const look: LookModule = {
  id: 'car.husky',
  look: {
    kind: 'car',
    // metallic paint above the stripe; the cladding below it is dull plastic that takes the knocks
    body: withFinish({ ...CAR_CELL, smooth: true, fn: huskyBody }, (_x, _y, z, m) =>
      m === 'paint' ? 'metal' : m === 'paintw' && z < 3.1 ? 'matte' : null,
    ),
    // a rack with four spot lamps across the front of it and the spare wheel lying behind
    top: {
      w: 10,
      h: 10,
      layers: 3,
      smooth: true,
      fn: (x, y, z) => {
        const ay = Math.abs(y);
        if (z < 0.45) {
          if (Math.abs(x) < 4.6 && ay < 4.5)
            if (Math.abs(x) > 4.15 || ay > 4.05 || Math.abs(x - 1.2) < 0.25) return 'cage';
          return null;
        }
        // the lamps: chrome bowls, lit lenses facing forward
        const ly = ay < 2.2 ? 1.1 : 3.3;
        if (Math.hypot(x - 3.5, ay - ly, (z - 1.35) * 1.05) < 0.98)
          return x > 3.85 ? 'light' : 'chrome';
        // the spare: tread, sidewall and a painted steel wheel
        const r = Math.hypot(x + 1.6, y);
        if (z < 1.9 && r < 2.75 - Math.max(0, z - 1.4) * 0.8) {
          if (r < 1.25) return z < 1.5 ? (r < 0.4 ? 'chrome' : 'paintw') : null;
          return r > 2.2 ? 'tread' : 'tire';
        }
        return null;
      },
    },
  },
};
export default look;
