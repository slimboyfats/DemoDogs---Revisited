import type { LookModule } from '@demodogs/shared';

/** A pine, plain and bold: a short trunk and four clean skirts stacked to a point. */
const look: LookModule = {
  id: 'prop.pine',
  look: {
    kind: 'prop',
    part: {
      w: 16,
      h: 16,
      layers: 22,
      smooth: true,
      fn: (x, y, z) => {
        const r = Math.hypot(x, y);
        if (z < 4 && r < 1.4) return x + y > 0.5 ? 'bark2' : 'bark';
        if (z < 3 || z > 21.6) return null;
        // four skirts, each a cone wide at its hem, each smaller than the one below
        const tier = Math.min(3, Math.floor((z - 3) / 4.4));
        const f = (z - 3 - tier * 4.4) / (tier === 3 ? 5.4 : 4.4);
        const reach = (6.6 - tier * 1.35) * (1 - f * 0.72);
        if (r > reach) return null;
        // lit on the side to the light and at the top of each skirt, dark under the hem
        const t = f - (x + y) * 0.06;
        return t > 0.55 ? 'pine3' : t > 0.12 ? 'pine2' : 'pine';
      },
    },
  },
};
export default look;
