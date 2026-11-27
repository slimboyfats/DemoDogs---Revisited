import type { LookModule } from '@demodogs/shared';

/**
 * An airship, facing +x: a long white hull with a red band and a blue nose, four fins at the
 * tail, a little cabin under its belly.
 */
const look: LookModule = {
  id: 'prop.airship',
  look: {
    kind: 'prop',
    part: {
      w: 34,
      h: 14,
      layers: 16,
      smooth: true,
      fn: (x, y, z) => {
        const ay = Math.abs(y);
        // the cabin, slung under the middle
        if (z < 3.2)
          return Math.abs(x - 1) < 3.4 && ay < 1.5 && z > 0.4
            ? z > 1.6 && z < 2.6
              ? 'glasshi'
              : 'black'
            : null;
        // the hull: a cigar
        const cz = 9;
        const fat = 6 * Math.sqrt(Math.max(0, 1 - (x / 16) ** 2));
        const r = Math.hypot(y, z - cz);
        if (r < fat) {
          if (r < fat - 1.5 && Math.abs(x) < 14) return null;
          if (x > 11.5) return 'shipb';
          return Math.abs(z - cz) < 1.3 ? 'paintr' : 'paintw';
        }
        // fins: up, down and out to each side
        if (x < -9.5 && x > -16.5) {
          const span = 6.4 - (x + 16.5) * 0.25;
          if (ay < 0.5 && Math.abs(z - cz) < span) return 'shipb';
          if (Math.abs(z - cz) < 0.5 && ay < span) return 'shipb';
        }
        return null;
      },
    },
    materials: { shipb: ['#1c6fc4', '#2f8fe8', '#8fd0ff'] },
  },
};
export default look;
