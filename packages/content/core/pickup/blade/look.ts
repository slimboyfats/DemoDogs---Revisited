import type { LookModule } from '@demodogs/shared';

/**
 * A curved plough blade in hazard stripes, with steel teeth along its bottom edge and two struts
 * back to the car. Drawn on the nose of a car that picked one up; +x faces the way the car goes.
 */
const look: LookModule = {
  id: 'pickup.blade',
  look: {
    kind: 'prop',
    part: {
      w: 5,
      h: 18,
      layers: 6,
      smooth: true,
      fn: (x, y, z) => {
        const ay = Math.abs(y);
        // struts back to the bumper
        if (x < -0.7 && ay > 3.2 && ay < 4.6 && z > 1 && z < 2.6) return 'band';
        if (ay > 8.6 - Math.max(0, z - 4) * 0.6) return null;
        // the face is hollow: its top and bottom reach forward, its middle sits back
        const k = (z - 3) / 3;
        const face = -0.5 + 0.9 * k * k;
        const d = x - face;
        if (d > 0.5 || d < -0.55) {
          // teeth along the bottom edge, every two pixels
          if (z < 0.9 && d > 0.5 && d < 1.4 && ((y % 2) + 2) % 2 < 1) return 'chrome';
          return null;
        }
        if (z > 5.4 || z < 0.5) return 'band';
        return ((Math.floor((y + z * 0.8) / 2.2) % 2) + 2) % 2 ? 'black' : 'hazard';
      },
    },
  },
};
export default look;
