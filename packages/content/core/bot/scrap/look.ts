import type { LookModule } from '@demodogs/shared';
import { disc } from '../../../src/shapes';

/** A boxy little robot: one glowing eye, an aerial, stubby legs (posed by the walk rig). */
const look: LookModule = {
  id: 'bot.scrap',
  look: {
    kind: 'bot',
    body: {
      w: 9,
      h: 9,
      layers: 7,
      smooth: true,
      fn: (x, y, z) => {
        const ax = Math.abs(x);
        const ay = Math.abs(y);
        // a rounded box of a body, and a smaller head on a collar
        const head = z > 4.6;
        const half = head ? 2.5 : 3.6;
        const d = Math.hypot(Math.max(0, ax - half + 1.2), Math.max(0, ay - half + 1.2)) - 1.2;
        if (d > 0 || z > 6.7 - Math.max(0, d + 0.9) * 0.9) return null;
        if (head) {
          // one wide glowing visor
          if (x > 1.6 && z > 5.1 && z < 6.1 && ay < 1.7) return 'boteye';
          return z < 4.9 ? 'botdark' : 'paint';
        }
        if (z < 1) return 'botdark';
        // a chest plate, vents down each side, bolts at the corners
        if (x > 3.2 && ay < 1.9 && z > 1.8 && z < 3.9)
          return ((z * 3) | 0) % 2 ? 'botdark' : 'band';
        if (ay > 3.3 && ax < 1.8 && z > 1.6 && z < 3.8)
          return ((x * 2.5 + 9) | 0) % 2 ? 'botdark' : 'paint';
        if (z > 4.25 && Math.abs(ax - 2.7) < 0.4 && Math.abs(ay - 2.7) < 0.4) return 'band';
        return Math.abs(z - 2.9) < 0.16 && d > -0.4 ? 'botdark' : 'paint';
      },
    },
    aerial: {
      w: 3,
      h: 3,
      layers: 4,
      fn: (x, y, z) =>
        z === 3 ? (disc(x, y, 1.2) ? 'light' : null) : disc(x, y, 0.5) ? 'cage' : null,
    },
    limb: { w: 3, h: 3, layers: 1, fn: (x, y) => (disc(x, y, 1.15) ? 'botdark' : null) },
    foot: {
      w: 5,
      h: 3,
      layers: 2,
      fn: (x, y, z) => (Math.abs(y) < 1.3 && x > -1.8 && x < (z ? 1 : 2.2) ? 'paint' : null),
    },
    chunk: {
      w: 4,
      h: 4,
      layers: 3,
      fn: (x, y, z) => (disc(x, y, 1.8 - z * 0.3) ? (z === 1 ? 'botdark' : 'paint') : null),
    },
  },
};
export default look;
