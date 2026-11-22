import type { LookModule } from '@demodogs/shared';

/**
 * A squat fuel barge: a rust hull with a rounded bow and a black waterline, a red gunwale, two
 * white fuel tanks with hazard bands along the deck, and a little wheelhouse at the stern.
 */
const look: LookModule = {
  id: 'prop.fuel-barge',
  look: {
    kind: 'prop',
    part: {
      w: 28,
      h: 14,
      layers: 11,
      smooth: true,
      fn: (x, y, z) => {
        const ay = Math.abs(y);
        // the hull's half width at x: full amidships, rounding in to the bow, square at the stern
        let half = 6.2;
        if (x > 8) half = x > 13.2 ? 0 : 6.2 * Math.sqrt(1 - ((x - 8) / 5.2) ** 2);
        if (x < -12.6) half = x < -13.4 ? 0 : 5.4;
        if (ay > half) return null;
        const edge = half - ay < 0.6;
        if (z < 4.2) {
          if (z < 1) return 'black';
          if (z > 3.6) return edge ? 'paintr2' : null;
          if (edge) return z > 2.8 && z < 3.2 ? 'band' : 'rust';
          return z > 3 ? 'rust2' : 'rust';
        }
        // the wheelhouse, at the stern
        if (x < -7.8 && x > -12.4 && ay < 3.4) {
          if (z > 9.4) return null;
          if (z > 8.8) return 'black';
          const face = x < -12 || x > -8.2 || ay > 3;
          if (face && z > 6.4 && z < 7.8 && (x + 40) % 1.6 > 0.4) return 'glass';
          return 'paintw';
        }
        if (Math.hypot(x + 10.2, y) < 0.7 && z > 9.4 && z < 10.8) return 'black';
        // the tanks, side by side along the deck
        if (x < -6.8 || x > 9) return null;
        const r = Math.hypot(ay - 3, z - 6.6);
        const cap = Math.max(0, x - 7.6, -5.4 - x);
        if (Math.hypot(r, cap * 1.3) > 2.6) return null;
        if (Math.abs(x - 1) < 0.8) return 'hazard';
        if (Math.abs(x + 3) < 0.25 || Math.abs(x - 5) < 0.25) return 'band';
        return 'paintw';
      },
    },
  },
};
export default look;
