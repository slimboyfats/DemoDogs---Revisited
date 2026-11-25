import type { LookModule } from '@demodogs/shared';

/** A park bench: three slats to sit on, two for the back, on dark iron legs. */
const look: LookModule = {
  id: 'prop.park-bench',
  look: {
    kind: 'prop',
    scale: 1.5,
    materials: {
      slat: ['#7a4a22', '#a86a30', '#cc8c48'],
    },
    part: {
      w: 10,
      h: 5,
      layers: 6,
      smooth: true,
      fn: (x, y, z) => {
        if (Math.abs(x) > 4.8) return null;
        // legs at each end
        if (Math.abs(Math.abs(x) - 3.8) < 0.5 && z < 2.4 && Math.abs(Math.abs(y) - 1.2) < 0.5)
          return 'botdark';
        // the seat
        if (z >= 2.4 && z < 3.2 && Math.abs(y) < 1.9)
          return Math.abs(y % 1.3) < 0.2 ? null : 'slat';
        // the back, along one side
        if (y < -1.4 && y > -2.2 && z >= 3.2 && z < 5.8)
          return Math.abs(z - 4.3) < 0.25 ? null : 'slat';
        return null;
      },
    },
  },
};
export default look;
