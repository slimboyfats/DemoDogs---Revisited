import type { LookModule } from '@demodogs/shared';

/** A bend sign: a board on two posts, red arrows on white pointing along it. */
const look: LookModule = {
  id: 'prop.chevron-sign',
  look: {
    kind: 'prop',
    part: {
      w: 12,
      h: 4,
      layers: 10,
      smooth: true,
      fn: (x, y, z) => {
        if (Math.abs(y) > 0.55) return null;
        if (z < 4.4) return Math.abs(Math.abs(x) - 3.6) < 0.45 ? 'bumper' : null;
        if (Math.abs(x) > 5.4 || z > 9.4) return null;
        if (Math.abs(x) > 5 || z > 9 || z < 4.8) return 'paintw';
        // arrows pointing along +x
        const u = x + Math.abs(z - 6.9) * 0.9 + 40;
        return u % 3.4 < 1.7 ? 'paintr' : 'paintw';
      },
    },
  },
};
export default look;
