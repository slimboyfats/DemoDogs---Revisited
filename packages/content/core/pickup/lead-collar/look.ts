import type { LookModule } from '@demodogs/shared';

/**
 * The lead ball of a lead collar: a dull grey shot with a seam round it and a steel shackle on
 * top, dragged along the ground behind the car that wears it.
 */
const look: LookModule = {
  id: 'pickup.lead-collar',
  look: {
    kind: 'prop',
    materials: {
      lead: ['#33373f', '#555b66', '#8e96a3'],
      lead2: ['#262a31', '#40454f', '#6d7480'],
    },
    part: {
      w: 8,
      h: 8,
      layers: 8,
      smooth: true,
      fn: (x, y, z) => {
        const d = Math.hypot(x, y, z - 3.3);
        // the shackle: a ring standing on the top of the ball
        const ring = Math.hypot(Math.hypot(x, z - 6.6) - 1.05, y);
        if (ring < 0.5 && z > 6) return 'chrome';
        if (d > 3.3) return null;
        if (Math.abs(z - 3.3) < 0.35 && d > 2.7) return 'lead2';
        // dents: a few flats knocked into it
        const dent = Math.sin(x * 2.1 + 1) * Math.sin(y * 1.9 + 2) * Math.sin(z * 2.3);
        return dent > 0.55 && d > 2.6 ? 'lead2' : 'lead';
      },
    },
  },
};
export default look;
