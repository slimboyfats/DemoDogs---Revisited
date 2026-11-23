import type { LookModule } from '@demodogs/shared';

/** A pumpkin: a ribbed orange ball, a little flat, with a green stalk. */
const look: LookModule = {
  id: 'prop.pumpkin',
  look: {
    kind: 'prop',
    part: {
      w: 7,
      h: 7,
      layers: 5,
      smooth: true,
      fn: (x, y, z) => {
        const r = Math.hypot(x, y);
        if (z > 3.6) return r < 0.45 && z < 4.6 ? 'leaf' : null;
        const a = Math.atan2(y, x);
        const rib = 2.5 + Math.cos(a * 7) * 0.22;
        if (Math.hypot(r / rib, (z - 1.9) / 1.9) > 1) return null;
        return Math.cos(a * 7) < -0.55 ? 'cone' : 'pumpkin';
      },
    },
  },
};
export default look;
