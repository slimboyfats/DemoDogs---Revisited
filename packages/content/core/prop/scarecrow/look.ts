import type { LookModule, Part } from '@demodogs/shared';
import { rigLook } from '../../../src/rigs';

/** How high the neck is: the head turns on top of it. */
const NECK = 9.4;

/** The pole and crossbar, and the ragged red shirt on them. */
const body: Part = {
  w: 4,
  h: 11,
  layers: 10,
  smooth: true,
  fn: (x, y, z) => {
    if (z > NECK) return null;
    // arms out along y, straw sticking out of the cuffs
    if (z > 7 && z < 8.6 && Math.abs(x) < 0.8) {
      if (Math.abs(y) < 4.2) return 'paintr';
      if (Math.abs(y) < 5.2 && Math.abs(z - 7.8) < 0.5) return 'straw2';
    }
    // the shirt, ragged at the hem
    if (z > 4 + Math.sin(y * 5) * 0.5 && Math.abs(x) < 0.9 && Math.abs(y) < 1.7)
      return Math.floor(z * 1.5 + y) % 4 === 0 ? 'paintr2' : 'paintr';
    return Math.hypot(x, y) < 0.4 ? 'wood2' : null;
  },
};

/** A straw head with two black eyes, under a black hat. */
const head: Part = {
  w: 5,
  h: 5,
  layers: 5,
  smooth: true,
  fn: (x, y, z) => {
    const r = Math.hypot(x, y);
    // hat: a brim and a crown
    if (z > 2.2) return r < (z < 2.7 ? 2.1 : 1.2) && z < 4.2 ? 'black' : null;
    if (Math.hypot(x, y, z - 1.1) > 1.4) return null;
    return x > 0.7 && Math.abs(Math.abs(y) - 0.55) < 0.3 && z > 1 ? 'black' : 'straw';
  },
};

/**
 * A scarecrow: a pole and a crossbar, a ragged red shirt, a straw head under a black hat. The
 * head turns to watch whatever drives by.
 */
const look: LookModule = {
  id: 'prop.scarecrow',
  look: rigLook(body, [
    { part: head, at: [0, 0, NECK], move: { kind: 'watch', reach: 110, arc: 2.6 } },
  ]),
};
export default look;
