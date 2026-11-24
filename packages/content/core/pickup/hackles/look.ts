import type { LookModule } from '@demodogs/shared';

/**
 * One slab: a steel plate with hazard chevrons on its outer face (+y) and a bolt in each corner.
 * A car wearing hackles has them bolted along its flanks until they blow off.
 */
const look: LookModule = {
  id: 'pickup.hackles',
  look: {
    kind: 'prop',
    part: {
      w: 6,
      h: 2,
      layers: 4,
      smooth: true,
      fn: (x, y, z) => {
        const ax = Math.abs(x);
        if (ax > 2.7 || Math.abs(y) > 0.95 || z < 0.2 || z > 3.6) return null;
        if (y < -0.45) return 'band';
        if (ax > 2.1 && Math.abs(z - 1.9) > 1.1) return 'chrome';
        if (ax > 2.4 || z < 0.5) return 'band';
        // chevrons over the face and across the top edge, which is what shows from above
        return ((Math.floor((ax + z) / 0.9) % 2) + 2) % 2 ? 'black' : 'hazard';
      },
    },
  },
};
export default look;
