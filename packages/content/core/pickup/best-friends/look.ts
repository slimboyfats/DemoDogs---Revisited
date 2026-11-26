import { finished, type LookModule } from '@demodogs/shared';

/**
 * A horseshoe magnet lying on a car's roof, red with bare steel tips: the bend at the back, the
 * two poles reaching out along +x towards the car it is pulling at.
 */
const look: LookModule = {
  id: 'pickup.best-friends',
  look: {
    kind: 'prop',
    part: {
      w: 11,
      h: 9,
      layers: 3,
      smooth: true,
      fn: (x, y, z) => {
        if (z > 2.6 || z < 0.2) return null;
        const ay = Math.abs(y);
        // the bend: half a ring behind x = -0.5; the arms: two bars in front of it
        const ring = Math.hypot(x + 0.5, y);
        const inBend = x < -0.5 && ring < 4.2 && ring > 2;
        const inArm = x >= -0.5 && x < 5 && ay < 4.2 && ay > 2;
        if (!inBend && !inArm) return null;
        // rounded off top and bottom
        const mid = inBend ? Math.abs(ring - 3.1) : Math.abs(ay - 3.1);
        if (Math.hypot(mid / 1.1, (z - 1.4) / 1.2) > 1) return null;
        return x > 3 ? finished('chrome', 'chrome') : finished('paintr', 'paint');
      },
    },
  },
};
export default look;
