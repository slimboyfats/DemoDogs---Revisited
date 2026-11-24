import type { LookModule } from '@demodogs/shared';

/** A sawtooth: 0 in the gaps, 1 at each tooth's point, `pitch` apart. */
const tooth = (y: number, pitch: number): number => {
  const t = (((y / pitch) % 1) + 1) % 1;
  return 1 - Math.abs(t - 0.5) * 2;
};

/**
 * A spring trap across the nose: two red jaws, the lower one's steel teeth pointing up and the
 * upper one's down, hinged on coil springs at each end. +x faces the way the car goes.
 */
const look: LookModule = {
  id: 'pickup.scrap-jaws',
  look: {
    kind: 'prop',
    materials: { jaw: ['#7a1414', '#c42222', '#f25a4a'] },
    part: {
      w: 5,
      h: 14,
      layers: 6,
      smooth: true,
      fn: (x, y, z) => {
        const ay = Math.abs(y);
        if (ay > 6 || x < -2 || x > 2.2) return null;
        // the springs at the hinge
        if (x < -0.9 && ay > 4.6 && ay < 5.8 && z > 0.8 && z < 3.6)
          return ((z * 2.4) | 0) % 2 ? 'chrome' : 'band';
        // the lower jaw: a plate, with teeth standing up along its front edge
        if (z < 1.0) return z > 0.2 ? (x > 1.1 ? 'chrome' : 'jaw') : null;
        if (x > 1.0 && z < 1.0 + 1.5 * tooth(y, 1.7)) return 'chrome';
        // the upper jaw is a frame held open, so the plate and its teeth show through it: two
        // arms and a bar across the front, teeth hanging from the bar
        const up = 2.5 + (x + 2) * 0.5;
        if (z < up - 1.3 * (x > 0.7 && x < 1.7 ? tooth(y + 0.85, 1.7) : 0) || z > up + 0.7)
          return null;
        if (z < up) return 'chrome';
        return ay > 4.3 || (x > 0.7 && x < 1.7) ? 'jaw' : null;
      },
    },
  },
};
export default look;
