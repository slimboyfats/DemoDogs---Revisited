import type { LookModule } from '@demodogs/shared';

/** A giant tennis ball: a bright yellow-green ball with the white seam winding round it. */
const look: LookModule = {
  id: 'prop.tennis-ball',
  look: {
    kind: 'prop',
    materials: {
      tennis: ['#8fae12', '#c4e02a', '#e6f65a'],
      seam: ['#c9cbb8', '#eceedd', '#ffffff'],
    },
    part: {
      w: 15,
      h: 15,
      layers: 14,
      smooth: true,
      fn: (x, y, z) => {
        const dz = z - 6.8;
        const r = Math.hypot(x, y, dz);
        if (r > 6.7) return null;
        // the seam: a wave that goes twice up and down on its way round the ball
        const wave = Math.sin(Math.atan2(y, x) * 2) * 3.2;
        return r > 4.6 && Math.abs(dz - wave) < 0.9 ? 'seam' : 'tennis';
      },
    },
  },
};
export default look;
