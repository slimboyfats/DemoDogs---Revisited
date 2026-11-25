import type { LookModule, Part } from '@demodogs/shared';
import { PEAK } from '../../../src/themes';

/** The pool with its bubbles at step `pose`: a ring of stones round steaming blue water. */
const pool = (pose: number): Part => ({
  w: 26,
  h: 26,
  layers: 2,
  smooth: true,
  fn: (x, y, z) => {
    const r = Math.hypot(x, y);
    const a = Math.atan2(y, x);
    // the stones: a lumpy ring, two px high
    const lump = 10.4 + Math.sin(a * 7) * 0.9;
    if (r > lump + 2.2) return null;
    if (r > lump - 1.6) return Math.floor(a * 3.5 + 12) % 2 ? 'basalt3' : 'basalt';
    if (z > 1) return null;
    // bubbles wander round the pool from pose to pose
    const b = a + pose * 2.1;
    const bubble = Math.hypot(r - 4.4 - Math.sin(b * 3) * 2.2, Math.sin(b * 2.5) * 3) < 1.1;
    return bubble || r < 1.4 + pose * 0.7 ? 'geyfoam' : 'geywater';
  },
});

/** A geyser: where it stands, and that it is quiet now. The spout itself is the client's. */
const look: LookModule = {
  id: 'prop.geyser',
  look: { kind: 'prop', materials: PEAK, part: pool(0), alts: [pool(1), pool(2)] },
};
export default look;
