import type { LookModule } from '@demodogs/shared';
import { BAY } from '../../../src/themes';

const hash = (n: number): number => {
  const s = Math.sin(n * 127.1 + 31.7) * 43758.5453;
  return s - Math.floor(s);
};

/** A length of old plank road, +x along it: grey boards of odd lengths, wide gaps, one gone. */
const look: LookModule = {
  id: 'prop.rickety-boards',
  look: {
    kind: 'prop',
    materials: {
      ...BAY,
      oldboard: ['#7c7264', '#a69680', '#c4b6a0'],
      oldboard2: ['#6a6156', '#8a7e6c', '#a69a86'],
    },
    part: {
      w: 40,
      h: 56,
      layers: 1,
      fn: (x, y) => {
        const k = Math.floor((x + 60) / 8);
        const u = x + 60 - k * 8;
        const reach = 27 - 5 * hash(k + (y > 0 ? 9 : 0)) * (hash(k * 3) > 0.35 ? 1 : 0);
        if (Math.abs(y) > reach) return null;
        if (u < 1 + hash(k * 7) || k % 5 === 3) return 'plankgap';
        return hash(k * 5) < 0.4 ? 'oldboard2' : 'oldboard';
      },
    },
  },
};
export default look;
