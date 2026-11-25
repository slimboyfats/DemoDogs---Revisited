import type { LookModule, Part } from '@demodogs/shared';
import { BAY } from '../../../src/themes';

/** A crab, facing +x, with its legs at one step or the other. */
const crab = (pose: number): Part => ({
  w: 9,
  h: 10,
  layers: 4,
  smooth: true,
  fn: (x, y, z) => {
    const ay = Math.abs(y);
    // eyes on short stalks
    if (z > 2.2) return Math.hypot(x - 1.5, ay - 0.9) < 0.42 && z < 3.2 ? 'black' : null;
    // the shell: a flat oval, wider than it is long
    if (z > 0.7 && (x / 2.1) ** 2 + (y / 2.9) ** 2 + ((z - 1.4) / 1) ** 2 < 1) return 'shell';
    // the claws, held out in front
    if (z > 0.5 && z < 1.9 && Math.hypot(x - 2.7, ay - 2.5) < 1.15)
      return x > 3 && ay < 2.5 && ay > 2.2 ? null : 'shell2';
    // three legs a side, stepping
    if (z < 1.1 && ay > 2.4 && ay < 4.2)
      for (let k = -1; k <= 1; k++) {
        const step = ((k + pose) & 1 ? 0.45 : -0.45) * (y > 0 ? 1 : -1);
        if (Math.abs(x - k * 1.3 - step - (ay - 2.4) * 0.2) < 0.36) return 'shell2';
      }
    return null;
  },
});

/** A crab: a red shell, two claws, six legs. */
const look: LookModule = {
  id: 'prop.crabs',
  look: { kind: 'prop', materials: BAY, part: crab(0), alts: [crab(1)] },
};
export default look;
