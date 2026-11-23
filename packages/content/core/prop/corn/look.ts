import type { LookModule } from '@demodogs/shared';

/** A corn stalk: a thin stem, long leaves drooping off it, a yellow cob and a tassel on top. */
const look: LookModule = {
  id: 'prop.corn',
  look: {
    kind: 'prop',
    part: {
      w: 7,
      h: 7,
      layers: 11,
      smooth: true,
      fn: (x, y, z) => {
        const r = Math.hypot(x, y);
        if (z > 9.6) return r < 0.5 ? 'straw' : null;
        if (r < 0.38) return 'lime';
        // the cob, hung off one side half way up
        if (z > 4.6 && z < 7 && Math.hypot(x - 0.8, y) < 0.6) return 'petaly';
        // leaves: four of them, leaving the stem at their own heights and drooping outwards
        for (let l = 0; l < 4; l++) {
          const a = l * 1.7 + 0.4;
          const u = x * Math.cos(a) + y * Math.sin(a);
          const v = -x * Math.sin(a) + y * Math.cos(a);
          const z0 = 2.4 + l * 1.9;
          if (
            u > 0.3 &&
            u < 3 &&
            Math.abs(v) < 0.42 &&
            Math.abs(z - (z0 + u * 0.7 - u * u * 0.32)) < 0.45
          )
            return l % 2 ? 'leaf2' : 'lime';
        }
        return null;
      },
    },
  },
};
export default look;
