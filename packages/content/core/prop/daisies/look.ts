import type { LookModule } from '@demodogs/shared';

/** Two daisies: square white heads with a yellow eye on short stems. */
const look: LookModule = {
  id: 'prop.daisies',
  look: {
    kind: 'prop',
    scale: 2,
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
        // two flowers, each a square white head round a yellow eye, on a leafy foot
        for (const [fx, fy, fh] of [
          [-1.6, -1, 2.4],
          [1.8, 1.4, 1.8],
        ] as const) {
          const d = Math.max(Math.abs(x - fx), Math.abs(y - fy));
          if (z > fh - 0.8 && z < fh) return d < 0.5 ? 'daisyeye' : d < 1.5 ? 'daisy' : null;
          if (z <= fh - 0.8 && d < 0.5) return 'daisyleaf';
        }
        return null;
      },
    },
  },
};
export default look;
