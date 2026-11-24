import type { LookModule } from '@demodogs/shared';

/**
 * A length of gantry: nothing below 20 px (cars drive under it), then a steel truss with a
 * chequered board along each face, a walkway on top and a lamp at each side.
 */
const look: LookModule = {
  id: 'prop.gantry-beam',
  look: {
    kind: 'prop',
    part: {
      // x runs across the road, y along it
      w: 10,
      h: 6,
      layers: 27,
      fn: (x, y, z) => {
        const ax = Math.abs(x);
        const ay = Math.abs(y);
        if (z < 20 || ax > 5 || ay > 2.6) return null;
        if (z > 26) return null;
        // the lamps hang under the truss
        if (z < 21) return ay > 1.6 && ax < 0.8 ? 'light' : null;
        // the board on each face: black and white squares
        if (ay > 2)
          return ((Math.floor((x + 40) / 1.7) + Math.floor(z / 1.7)) & 1) === 0
            ? 'paintw'
            : 'black';
        // the walkway on top, and the chords and braces under it
        if (z > 25) return ((x + 40) | 0) % 3 === 0 ? 'cage' : 'engine';
        if (z < 22) return ay > 1.2 ? 'cage' : null;
        return Math.abs((((x + 40) % 4) / 4) * 3 - (z - 22)) < 0.6 && ay > 1.2 ? 'engine' : null;
      },
    },
  },
};
export default look;
