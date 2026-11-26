import type { LookModule } from '@demodogs/shared';

/** A beach parasol: a white pole and a shallow canopy in eight red and white gores. */
const look: LookModule = {
  id: 'prop.parasol',
  look: {
    kind: 'prop',
    part: {
      w: 18,
      h: 18,
      layers: 15,
      smooth: true,
      fn: (x, y, z) => {
        const r = Math.hypot(x, y);
        if (z < 13.6 && r < 0.45) return 'paintw';
        if (z > 14 && r < 0.7) return 'paintr';
        // the canopy: a thin shell, wide at its rim and closing to the pole's top
        const rim = 8.2 * Math.sqrt(Math.max(0, (13.6 - z) / 3.4));
        if (z < 10.2 || z > 13.6 || r > rim || r < rim - 1.5) return null;
        const k = Math.floor(((Math.atan2(y, x) + Math.PI) / (Math.PI * 2)) * 8) % 2;
        return k ? 'paintr' : 'paintw';
      },
    },
  },
};
export default look;
