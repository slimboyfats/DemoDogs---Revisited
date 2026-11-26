import type { LookModule } from '@demodogs/shared';

/**
 * A jump's takeoff, +x up it: a block climbing to a sheer lip. In a race the ground is raised
 * and painted to look like the way onto it, so this is only its picture in the track creator.
 */
const look: LookModule = {
  id: 'prop.jump-takeoff',
  look: {
    kind: 'prop',
    part: {
      w: 128,
      h: 64,
      layers: 12,
      smooth: true,
      fn: (x, y, z) => {
        if (Math.abs(x) > 64 || Math.abs(y) > 32) return null;
        const top = 0.5 + ((x + 64) / 128) * 11;
        if (z > top) return null;
        if (z < top - 1) return 'engine';
        // a striped lip, so it reads as a jump
        if (x > 52) return Math.floor((y + 64) / 8) % 2 ? 'paintr' : 'paintw';
        return 'bumper';
      },
    },
  },
};
export default look;
