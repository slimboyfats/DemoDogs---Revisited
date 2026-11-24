import type { LookModule } from '@demodogs/shared';

/** A lattice tower: four corner posts, cross braces, a hazard-striped foot and a lamp on top. */
const look: LookModule = {
  id: 'prop.gantry-leg',
  look: {
    kind: 'prop',
    part: {
      w: 6,
      h: 6,
      layers: 28,
      fn: (x, y, z) => {
        const ax = Math.abs(x);
        const ay = Math.abs(y);
        if (ax > 3 || ay > 3) return null;
        if (z < 3) return ((x + y + 40) | 0) % 2 === 0 ? 'hazard' : 'black';
        if (z > 26.5) return ax < 1 && ay < 1 ? 'light' : null;
        if (z > 25) return 'engine';
        const corner = ax > 2.1 && ay > 2.1;
        if (corner) return 'cage';
        // braces: a ring every few px up, and a diagonal on each face between the rings
        const face = ax > 2.3 || ay > 2.3;
        if (!face) return null;
        if (z % 6 < 0.8) return 'engine';
        const along = ax > 2.3 ? y : x;
        return Math.abs(((z % 6) / 6) * 5 - 2.5 - along) < 0.5 ? 'engine' : null;
      },
    },
  },
};
export default look;
