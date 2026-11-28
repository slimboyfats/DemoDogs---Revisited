import type { LookModule } from '@demodogs/shared';

const GORES = ['paintr', 'paintw', 'balloony', 'paintw', 'balloonb', 'paintw'];

/**
 * A hot-air balloon: a big striped envelope, a wicker basket hung under it on four ropes. It is
 * drawn up in the air (its `float`), tethered over the roadside.
 */
const look: LookModule = {
  id: 'prop.hot-air-balloon',
  look: {
    kind: 'prop',
    part: {
      w: 26,
      h: 26,
      layers: 34,
      smooth: true,
      fn: (x, y, z) => {
        const r = Math.hypot(x, y);
        // the basket
        if (z < 4)
          return Math.abs(x) < 2.2 && Math.abs(y) < 2.2 ? (z > 3 ? 'wood2' : 'straw2') : null;
        // ropes up to the mouth
        if (z < 10)
          return Math.abs(Math.abs(x) - 2 - (z - 4) * 0.2) < 0.35 &&
            Math.abs(Math.abs(y) - 2 - (z - 4) * 0.2) < 0.35
            ? 'wood2'
            : null;
        // the envelope: a pear, widest two thirds of the way up, in six gores
        const t = (z - 10) / 23;
        if (t > 1) return null;
        const wide =
          12 *
          Math.sin(Math.min(1, t * 1.25 + 0.12) * Math.PI * 0.5) *
          (t > 0.7 ? Math.cos(((t - 0.7) / 0.3) * Math.PI * 0.5) ** 0.6 : 1);
        if (r > wide) return null;
        // (hollow, but for a floor over the mouth: only its skin is drawn)
        if (r < wide - 1.6 && t > 0.06 && t < 0.94) return null;
        const g = Math.floor(((Math.atan2(y, x) + Math.PI) / (Math.PI * 2)) * 12) % 6;
        return Math.abs(t - 0.45) < 0.07 ? 'balloonb' : GORES[g]!;
      },
    },
    materials: {
      balloony: ['#e0a400', '#ffcf2a', '#fff0a0'],
      balloonb: ['#1c6fc4', '#2f8fe8', '#8fd0ff'],
    },
  },
};
export default look;
