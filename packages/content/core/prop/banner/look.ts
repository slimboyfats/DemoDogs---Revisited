import type { LookModule, Part } from '@demodogs/shared';
import { rigLook } from '../../../src/rigs';
import { KEEP } from '../../../src/themes';

const HOIST = 15;

/** A dark pole with a gold point. */
const pole: Part = {
  w: 2,
  h: 2,
  layers: 24,
  smooth: true,
  fn: (x, y, z) => {
    const r = Math.hypot(x, y);
    if (z > 22.4) return r < 0.75 * (1 - (z - 22.4) / 1.6) + 0.1 ? 'gold' : null;
    return r < 0.45 ? 'wood2' : null;
  },
};

/** The cloth: a long pennant, red with a gold band, narrowing to a forked tail. */
const cloth: Part = {
  w: 22,
  h: 2,
  layers: 8,
  smooth: true,
  fn: (x, y, z) => {
    if (x < 0.3 || x > 10.5 || Math.abs(y - Math.sin(x * 0.9) * 0.55) > 0.4) return null;
    const mid = 3.6;
    const half = 3.4 - x * 0.2;
    const v = z - mid;
    if (Math.abs(v) > half) return null;
    // the fork: a notch cut into the fly
    if (x > 8 && Math.abs(v) < (x - 8) * 0.6) return null;
    return Math.abs(v) < 0.75 ? 'gold' : 'rooftile';
  },
};

/** A banner: the pole, and the pennant off the top of it, streaming with the wind. */
const look: LookModule = {
  id: 'prop.banner',
  look: rigLook(
    pole,
    [{ part: cloth, at: [0, 0, HOIST], face: Math.PI / 2, move: { kind: 'wind', flutter: 0.2 } }],
    KEEP,
  ),
};
export default look;
