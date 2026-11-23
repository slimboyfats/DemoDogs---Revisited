import type { LookModule } from '@demodogs/shared';

/**
 * A span of the raised road, high over the track (nothing below layer 17, so cars pass under):
 * a concrete slab with an asphalt top, a lane line, and a railing along each edge (+-y).
 */
const look: LookModule = {
  id: 'prop.overpass-deck',
  look: {
    kind: 'prop',
    part: {
      w: 13,
      h: 13,
      layers: 22,
      fn: (x, y, z) => {
        if (z < 18 || Math.abs(x) > 6.5 || Math.abs(y) > 6.5) return null;
        if (z < 20) return 'concrete';
        if (z === 20)
          return Math.abs(y) > 5.6 ? 'concrete' : Math.abs(y) < 0.3 ? 'paintw' : 'black';
        return Math.abs(y) > 5.8 && Math.abs(((x + 20) % 2) - 1) > 0.5 ? 'gunmetal' : null;
      },
    },
    materials: { gunmetal: ['#25282c', '#3b3f45', '#6b7078'] },
  },
};
export default look;
