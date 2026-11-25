import type { LookModule } from '@demodogs/shared';

/** A few daisies: white heads with a yellow eye on short stems, and a leaf or two. */
const look: LookModule = {
  id: 'prop.daisies',
  look: {
    kind: 'prop',
    scale: 1.5,
    materials: {
      daisy: ['#e6e6dc', '#f8f8f0', '#fcfcf4'],
      daisyeye: ['#d8a410', '#f6c820', '#ffe060'],
      daisyleaf: ['#3a7a26', '#4e9430', '#68ae3c'],
    },
    part: {
      w: 8,
      h: 8,
      layers: 3,
      smooth: true,
      fn: (x, y, z) => {
        // three or four flowers a little apart, each a white head two cubes across round a yellow
        // eye, on a leafy foot
        for (const [fx, fy, fh] of [
          [-2, -1.5, 1.6],
          [1.5, -2.2, 1.2],
          [2.2, 1.6, 1.8],
          [-1.2, 2.2, 1.4],
        ] as const) {
          const d = Math.max(Math.abs(x - fx), Math.abs(y - fy));
          if (z > fh - 0.8 && z < fh) return d < 0.35 ? 'daisyeye' : d < 0.95 ? 'daisy' : null;
          if (z <= fh - 0.8 && d < 0.4) return 'daisyleaf';
        }
        return null;
      },
    },
  },
};
export default look;
