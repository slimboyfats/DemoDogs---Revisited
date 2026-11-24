import type { LookModule } from '@demodogs/shared';

/** A blue boost bottle lying along the car in a cradle, strapped down, its valve to the front. */
const look: LookModule = {
  id: 'pickup.spare-tank',
  look: {
    kind: 'prop',
    materials: { nitro: ['#1c4f8a', '#2f7fd0', '#8fd0ff'] },
    part: {
      w: 9,
      h: 4,
      layers: 4,
      smooth: true,
      fn: (x, y, z) => {
        const r = Math.hypot(y, z - 1.9);
        if (z < 0.5) return Math.abs(y) < 1.3 && Math.abs(x) < 3 ? 'under' : null;
        // the valve and its hand wheel
        if (x > 3.1) return x < 4.1 && r < (x > 3.7 ? 0.9 : 0.45) ? 'chrome' : null;
        // rounded ends
        const end = Math.max(0, Math.abs(x + 0.4) - 2.4);
        if (Math.hypot(r, end) > 1.65) return null;
        if (Math.abs(Math.abs(x + 0.4) - 1.6) < 0.3) return 'band';
        return 'nitro';
      },
    },
  },
};
export default look;
