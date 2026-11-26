import { withFinish, type LookModule, type ShapeFn } from '@demodogs/shared';
import { carBody, fillet } from '../../../src/carshape';
import { CAR_CELL } from '../../../src/shapes';

const B = 5.8;
/** How wide the nose is: the body pinches in ahead of the screen, so the front wheels stand clear of it. */
const NOSE = 2.8;
const noseAt = (x: number): number => {
  const t = Math.min(1, Math.max(0, (x + 0.6) / 2.6));
  return B - (B - NOSE) * t * t * (3 - 2 * t);
};
/** The engine stands out of the bonnet from here to here, with a pipe a cylinder each side. */
const BLOCK: readonly [number, number] = [2.5, 6.3];
const PIPES = [2.9, 3.8, 4.7, 5.6];

/** A hot rod: a chopped cab at the back, flames down its flanks, a narrow nose and the engine out in the air. */
export const greyhoundBody: ShapeFn = carBody({
  a: 12.5,
  b: B,
  r: 2.4,
  taper: [0.2, 0.5],
  deck: [
    [-12.5, 4.2],
    [-10.6, 4.8],
    [-1, 4.7],
    [2, 4.0],
    [12.5, 3.3],
  ],
  round: 1.5,
  arches: [{ x: -7.4, r: 3.6 }],
  cabin: { x0: -8.8, x1: -0.4, roof: 6.9, inset: 0.9, lean: 0.8, rakeF: 1.5, rakeR: 1.3 },
  head: [1.1, 2.6, 2.0, 3.0],
  tail: [3.2, 5.2, 2.9, 3.7],
  grille: 1.1,
  gaps: [-4.6],
  exhausts: [],
  engine: [0, 0],
  bare: { aerial: true },
  extra: (x, y, z, top) => {
    if (x < -0.6) return undefined;
    const ay = Math.abs(y);
    const nw = noseAt(x);
    // the front axle: a bright tube out to each wheel
    if (ay > NOSE - 0.3 && ay < 4.1 && Math.hypot(x - 8.6, z - 1.75) < 0.36) return 'chrome';
    if (x > BLOCK[0] && x < BLOCK[1] && top > 0) {
      const h = z - top;
      // the block, a ribbed blower on it and a scoop on that, its mouth to the wind
      if (ay < 1.7 && h > -0.3 && h <= 0.8) return 'engine';
      if (ay < 1.25 && h > 0.8 && h <= 1.8 && x > BLOCK[0] + 0.5 && x < BLOCK[1] - 0.4)
        return (((x * 2.5) | 0) & 1) === 0 ? 'chrome' : 'bumper';
      if (ay < 1.0 && h > 1.8 && h <= 2.7 && x > BLOCK[0] + 0.9 && x < BLOCK[1] - 0.2)
        return x > BLOCK[1] - 0.75 ? 'grille' : 'paint';
      // the pipes: straight out of each side and up
      if (ay > 1.5 && ay < 4.0)
        for (const px of PIPES) {
          const r = Math.hypot(x - px, h - 0.25 - (ay - 1.5) * 0.42);
          if (r < 0.33) return ay > 3.75 && r < 0.18 ? 'under' : 'chrome';
        }
    }
    // the pinch: nothing outside the nose, and its shoulder rounded over
    if (ay > nw) return null;
    if (nw < B - 0.05 && z <= top && z > top - fillet(nw - ay, 1.0)) return null;
    return undefined;
  },
  paint: (x, y, z, skin) => {
    // flames licking back along each flank from the cowl
    if (skin > 0.45 || Math.abs(y) < 4 || x > 1.4 || x < -7.2) return undefined;
    const reach = (x + 7.2) / 8.6;
    const f = 2.1 + (0.5 + 1.5 * Math.abs(Math.sin(x * 1.25))) * reach;
    return z < f - 0.75 ? 'hazard' : z < f ? 'cone' : undefined;
  },
});

const look: LookModule = {
  id: 'car.greyhound',
  look: {
    kind: 'car',
    // metallic paint, and an engine polished like a mirror
    body: withFinish({ ...CAR_CELL, smooth: true, fn: greyhoundBody }, (x, _y, _z, m) =>
      m === 'paint' ? 'metal' : m === 'bumper' && x > BLOCK[0] ? 'chrome' : null,
    ),
    // a parachute pack strapped to the tail
    top: {
      w: 3,
      h: 5,
      layers: 2,
      smooth: true,
      fn: (x, y, z) => {
        const ay = Math.abs(y);
        if (Math.abs(x) > 1.2 || ay > 2.1 || z > 1.7 - ay * 0.2) return null;
        return Math.abs(ay - 1.0) < 0.22 ? 'chrome' : x < -0.8 && ay < 0.5 ? 'hazard' : 'paintr';
      },
    },
  },
};
export default look;
