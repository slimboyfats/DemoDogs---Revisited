import { DECK_SURFACE, type LookModule } from '@demodogs/shared';
import { noise3 } from '../../../src/shapes';

/**
 * Half the road a deck carries (the flyover venues use a 112 wide road, and the cars up on it
 * are held within that: a narrower deck leaves them hanging over its rail), and its edges.
 */
const ROAD = 56;
const EDGE = 59;
const S = DECK_SURFACE;

/**
 * A piece of flyover, nine art px along the road: three pairs of steel girders under a cast slab,
 * a tarmac top with a dashed middle line, hazard-striped kerbs and a steel rail along each edge.
 * The road surface is DECK_SURFACE up, where the cars ride.
 */
export const deckLook = (id: string, rails: boolean): LookModule => ({
  id,
  look: {
    kind: 'prop',
    materials: {
      tarmac: ['#2f3035', '#3d3e44', '#4a4b52'],
      tarmac2: ['#36373d', '#45464d', '#55565e'],
      line: ['#b9b3a0', '#ddd6c0', '#f3eedb'],
    },
    part: {
      w: 9,
      h: EDGE * 2 + 1,
      layers: rails ? S + 4 : S,
      smooth: true,
      fn: (x, y, z) => {
        const ay = Math.abs(y);
        if (Math.abs(x) > 4.6 || ay > EDGE) return null;
        // girders under the slab, with a cross beam at the joint
        if (z < S - 1.6) {
          const g = ay % 17;
          const r = (ay + 14) % 20;
          if (r > 0 && r < 3.5)
            return z < 0.5 || z > S - 2.2 || Math.abs(r - 1.75) < 0.6
              ? 'rust'
              : g > 7.8 && g < 8.2
                ? 'rust2'
                : 'cage';
          if (Math.abs(x) > 4 && ay < EDGE - 6 && z > S - 2.6) return 'rust';
          return null;
        }
        if (z < S - 0.5) return noise3(x * 2, y * 0.7, z) > 0.78 ? 'stone2' : 'concrete';
        if (z < S) {
          if (ay > ROAD) return Math.floor((x + y + 40) / 2.2) % 2 ? 'hazard' : 'black';
          if (ay < 0.55 && (x + 4.6) % 9 < 4.5) return 'line';
          return noise3(x * 1.7, y * 1.7, 0) > 0.66 ? 'tarmac2' : 'tarmac';
        }
        // the rail: posts and two rails along the outer edge
        if (!rails || ay < EDGE - 1.6) return null;
        const post = Math.abs(((x + 4.6) % 4.6) - 2.3) < 0.55;
        if (post || z > S + 3.2 || Math.abs(z - (S + 1.8)) < 0.35)
          return z > S + 3.2 ? 'hazard' : 'chrome';
        return null;
      },
    },
  },
});
export default deckLook('prop.flyover-deck', true);
