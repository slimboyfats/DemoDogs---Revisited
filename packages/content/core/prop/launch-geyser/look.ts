import type { LookModule, Part } from '@demodogs/shared';
import { PEAK } from '../../../src/themes';

/** The pool with its bubbles at step `pose`: a wide ring of stones round steaming blue water. */
const pool = (pose: number): Part => ({
  w: 44,
  h: 56,
  layers: 2,
  smooth: true,
  fn: (x, y, z) => {
    // (longer across the path than along it)
    const r = Math.hypot(x / 20, y / 26);
    const a = Math.atan2(y, x);
    const lump = 0.86 + Math.sin(a * 9) * 0.05;
    if (r > lump + 0.14) return null;
    if (r > lump - 0.08) return Math.floor(a * 4.5 + 12) % 2 ? 'basalt3' : 'basalt';
    if (z > 1) return null;
    // bubbles wander round the pool from pose to pose
    const b = a + pose * 2.1;
    const bubble = Math.hypot(r * 20 - 9 - Math.sin(b * 3) * 5, Math.sin(b * 2.5) * 3) < 1.6;
    return bubble || r < 0.12 + pose * 0.05 ? 'geyfoam' : 'geywater';
  },
});

/** A launch geyser: where it lies, and that it is quiet now. The spout itself is the client's. */
const look: LookModule = {
  id: 'prop.launch-geyser',
  look: { kind: 'prop', materials: PEAK, part: pool(0), alts: [pool(1), pool(2)] },
};
export default look;
