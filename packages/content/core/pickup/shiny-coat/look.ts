import type { LookModule } from '@demodogs/shared';

/**
 * One mirror plate: a framed strip of polished facets. Drawn down each flank of a car with a
 * mirror coat.
 */
const look: LookModule = {
  id: 'pickup.shiny-coat',
  look: {
    kind: 'prop',
    part: {
      w: 10,
      h: 1,
      layers: 5,
      smooth: true,
      fn: (x, y, z) => {
        if (Math.abs(y) > 0.45 || Math.abs(x) > 4.8 || z < 0.7 || z > 4.3) return null;
        if (Math.abs(x) > 4.3 || z < 1.15 || z > 3.85) return 'band';
        // facets tilted two ways, so some catch the light and some the sky
        return ((Math.floor(x * 1.1 + z * 1.1) % 2) + 2) % 2 ? 'chrome' : 'glasshi';
      },
    },
  },
};
export default look;
