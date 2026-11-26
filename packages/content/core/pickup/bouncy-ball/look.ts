import { finished, type LookModule } from '@demodogs/shared';

/**
 * A rubber ball in beach-ball stripes, red, white and blue, with a white cap on top. Three of
 * them go round a car that is a bumper for the time being.
 */
const look: LookModule = {
  id: 'pickup.bouncy-ball',
  look: {
    kind: 'prop',
    materials: {
      ballblue: ['#0f4fb0', '#2a86f0', '#74bcff'],
    },
    part: {
      w: 7,
      h: 7,
      layers: 6,
      smooth: true,
      fn: (x, y, z) => {
        const d = Math.hypot(x, y, z - 3);
        if (d > 2.9) return null;
        if (z > 5.3) return finished('paintw', 'paint');
        const k = Math.floor(((Math.atan2(y, x) + Math.PI) / (Math.PI * 2)) * 6) % 3;
        return finished(k === 0 ? 'paintr' : k === 1 ? 'paintw' : 'ballblue', 'paint');
      },
    },
  },
};
export default look;
