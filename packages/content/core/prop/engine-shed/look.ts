import type { LookModule } from '@demodogs/shared';

/**
 * An engine shed, its doorway facing +x: brick walls, a black opening with a striped lintel, a
 * pitched red roof. A train comes out of it and goes into the one at the far end of the line.
 */
const look: LookModule = {
  id: 'prop.engine-shed',
  look: {
    kind: 'prop',
    part: {
      w: 24,
      h: 22,
      layers: 22,
      smooth: true,
      fn: (x, y, z) => {
        const ay = Math.abs(y);
        if (Math.abs(x) > 11 || ay > 10) return null;
        // the roof: pitched, the ridge along the line
        const eave = 13;
        const roof = eave + (10 - ay) * 0.8;
        if (z >= eave && z < roof + 1.2) {
          if (z >= roof - 0.2) return Math.floor(x / 2) % 2 ? 'paintr' : 'paintr2';
          // the gable ends, bricked up to the roof
          return Math.abs(x) > 10 ? 'rust' : null;
        }
        if (z >= eave) return null;
        const wall = Math.abs(x) > 10 || ay > 9;
        // (dark all the way through: it is hit as the block it is)
        if (!wall) return 'black';
        // the doorway in the front: dark inside, a hazard-striped beam over it
        if (x > 10 && ay < 6.4) {
          if (z < 10.4) return 'black';
          if (z < 12) return Math.floor((y + 20) / 1.6) % 2 ? 'hazard' : 'black';
        }
        // brick, with a row of small windows down each side
        if (ay > 9 && z > 6 && z < 9 && Math.abs(((x + 20) % 6) - 3) < 1.2) return 'glasshi';
        return (Math.floor(z / 1.5) + Math.floor((x + y + 40) / 3)) % 2 ? 'rust' : 'rust2';
      },
    },
  },
};
export default look;
