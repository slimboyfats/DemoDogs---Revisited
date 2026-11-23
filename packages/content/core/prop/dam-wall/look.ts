import type { LookModule } from '@demodogs/shared';

/**
 * A block of dam: cast concrete in lifts with board marks, the lake side stained dark to the water
 * line, a walkway on top with a rusty handrail along the downstream edge.
 */
const look: LookModule = {
  id: 'prop.dam-wall',
  look: {
    kind: 'prop',
    part: {
      w: 9,
      h: 9,
      layers: 15,
      fn: (x, ly, z) => {
        // +y is upstream: turn it round so the lake side is -y
        const y = -ly;
        if (Math.abs(x) > 4.6) return null;
        // it batters back: thick at the foot, a walkway's width at the top
        const back = 4 - z * 0.13;
        if (y < -2.2 || y > back) return null;
        if (z > 12.6) {
          if (z < 13.6) return 'stone';
          return y > back - 0.5 && (x + 40) % 2.3 > 0.5 ? 'rust' : null;
        }
        // the lake side (-y): dark weed and silt up to the water line
        if (y < -1.7) return z < 8 ? ((x * 5 + z * 3) % 4 < 1 ? 'moss' : 'stone2') : 'concrete';
        if (z % 3.2 < 0.25) return 'stone';
        return ((x * 3 + z * 7) | 0) % 13 === 0 ? 'stone2' : 'concrete';
      },
    },
  },
};
export default look;
