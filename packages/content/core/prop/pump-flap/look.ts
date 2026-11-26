import type { LookModule } from '@demodogs/shared';

/**
 * A pump takeoff's flap, +x up the ramp: a steel plate as wide as the ramp in yellow and black
 * chevrons that point the way, with a green lamp strip along its front edge.
 */
const look: LookModule = {
  id: 'prop.pump-flap',
  look: {
    kind: 'prop',
    part: {
      w: 20,
      h: 64,
      layers: 3,
      fn: (x, y, z) => {
        if (Math.abs(x) > 10 || Math.abs(y) > 31) return null;
        if (z < 2) return 'chrome';
        if (x > 7.5) return 'lampgreen';
        return Math.floor((x + Math.abs(y) * 0.7 + 40) / 4) % 2 ? 'hazard' : 'black';
      },
    },
    materials: { lampgreen: ['#12a150', '#2ee06f', '#a5f5c2'] },
  },
};
export default look;
