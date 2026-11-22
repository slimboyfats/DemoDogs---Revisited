import type { LookModule } from '@demodogs/shared';
import { disc, rr } from '../../../src/shapes';

/** A boxy little robot: one glowing eye, an aerial, stubby legs (posed by the walk rig). */
const look: LookModule = {
  id: 'bot.scrap',
  look: {
    kind: 'bot',
    body: {
      w: 9,
      h: 9,
      layers: 7,
      fn: (x, y, z) => {
        const r = z === 6 ? 2.6 : 3.6;
        if (!rr(x, y, r, r, 1.4)) return null;
        if (x > 2.4 && z >= 3 && z <= 4 && Math.abs(y) < 1.4) return 'boteye';
        return z === 1 ? 'botdark' : 'paint';
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
