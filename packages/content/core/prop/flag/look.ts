import type { LookModule } from '@demodogs/shared';

/** A chequered flag: a white pole with a gold knob, and a black and white cloth off the top of it. */
const look: LookModule = {
  id: 'prop.flag',
  look: {
    kind: 'prop',
    part: {
      w: 4,
      h: 16,
      layers: 20,
      smooth: true,
      fn: (x, y, z) => {
        const r = Math.hypot(x, y);
        if (z > 18.6) return r < 0.7 && z < 19.6 ? 'hazard' : null;
        if (r < 0.42) return 'paintw';
        // the cloth: off the pole along +y, rippling
        if (z > 12.4 && y > 0.3 && y < 8 && Math.abs(x - Math.sin(y * 1.1) * 0.5) < 0.4)
          return (Math.floor(y / 1.5) + Math.floor((z - 12.4) / 1.5)) % 2 ? 'black' : 'paintw';
        return null;
      },
    },
  },
};
export default look;
