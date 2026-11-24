import type { LookModule } from '@demodogs/shared';

/** A rocket bottle lying along the car: red nose, white body, three fins and a black nozzle. */
const look: LookModule = {
  id: 'pickup.zoomies',
  look: {
    kind: 'prop',
    part: {
      w: 11,
      h: 5,
      layers: 4,
      smooth: true,
      fn: (x, y, z) => {
        const zc = z - 1.8;
        const r = Math.hypot(y, zc);
        if (z < 0.45) return Math.abs(y) < 1.1 && Math.abs(x) < 2.6 ? 'under' : null;
        // fins at the tail: one each side and one on top
        if (x < -2 && x > -4.4) {
          const reach = 2.4 - Math.max(0, x + 3) * 1.1;
          if (Math.abs(zc) < 0.22 && Math.abs(y) < reach) return 'paintr';
          if (Math.abs(y) < 0.22 && zc > 0 && zc < reach - 0.3) return 'paintr';
        }
        if (x < -3.6) {
          // the nozzle: a bell, hollow
          const bell = 0.7 + (-3.6 - x) * 0.45;
          return x > -5.2 && r < bell && r > bell - 0.42 ? 'black' : null;
        }
        if (x > 3) return r < 1.3 * (1 - (x - 3) / 2.3) ? 'paintr' : null;
        if (r > 1.3) return Math.abs(Math.abs(x - 0.3) - 1.9) < 0.28 && r < 1.5 ? 'band' : null;
        return x > 1.9 && x < 2.6 ? 'paintr' : 'rocket';
      },
    },
  },
};
export default look;
