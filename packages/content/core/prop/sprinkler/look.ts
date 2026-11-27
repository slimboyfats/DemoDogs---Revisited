import type { LookModule, Part } from '@demodogs/shared';
import { rigLook } from '../../../src/rigs';

/** A stand pipe on a round foot. */
const pipe: Part = {
  w: 4,
  h: 4,
  layers: 5,
  smooth: true,
  fn: (x, y, z) => {
    const r = Math.hypot(x, y);
    if (z < 1) return r < 1.7 ? 'black' : null;
    return r < 0.6 ? 'chrome' : null;
  },
};

/** The arm that turns on top of it: a bar with a nozzle at each end. */
const arm: Part = {
  w: 8,
  h: 2,
  layers: 2,
  smooth: true,
  fn: (x, y, z) => {
    if (Math.abs(y) > 0.5 || Math.abs(x) > 3.4 || z > 1.2) return null;
    return Math.abs(x) > 2.5 ? 'hazard' : 'chrome';
  },
};

/** How fast it turns, rad/s: the manifest's `spout.spin` is the same, so the jets come off the arm. */
export const SPIN = 2.2;

/** A lawn sprinkler: its arm goes round and throws two jets of water out over the grass. */
const look: LookModule = {
  id: 'prop.sprinkler',
  look: rigLook(pipe, [{ part: arm, at: [0, 0, 4.2], move: { kind: 'turn', rate: SPIN } }]),
};
export default look;
