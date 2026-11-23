import type { LookModule } from '@demodogs/shared';

/** A cast iron mooring bollard with a painted cap, and a hemp rope looped on it and trailing. */
const look: LookModule = {
  id: 'prop.bollard',
  look: {
    kind: 'prop',
    part: {
      w: 7,
      h: 7,
      layers: 5,
      smooth: true,
      fn: (x, y, z) => {
        const r = Math.hypot(x, y);
        // the rope: a loop round the neck, and an end lying off along +x
        if (z > 2 && z < 2.8 && r > 1.3 && r < 1.9 && x > -1) return 'wood';
        if (z < 0.5 && x > 1 && x < 3.4 && Math.abs(y - (x - 1) * 0.3) < 0.4) return 'wood';
        if (z < 0.6) return r < 2.4 ? 'mine' : null;
        if (z < 3.6) return r < 1.35 ? 'mine' : null;
        if (z < 4.6) return r < 2 ? (z > 4.2 ? 'hazard' : 'mine') : null;
        return null;
      },
    },
  },
};
export default look;
