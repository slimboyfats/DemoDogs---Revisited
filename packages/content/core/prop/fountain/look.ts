import type { LookModule } from '@demodogs/shared';

/**
 * A fountain: a round stone basin full of water, a stem up the middle with a bowl on it. The
 * water it throws is the client's (its `spout`).
 */
const look: LookModule = {
  id: 'prop.fountain',
  look: {
    kind: 'prop',
    part: {
      w: 20,
      h: 20,
      layers: 12,
      smooth: true,
      fn: (x, y, z) => {
        const r = Math.hypot(x, y);
        // the basin: a rim, water inside it
        if (z < 3.4) {
          if (r > 9) return null;
          if (r > 7.6) return z > 2.6 ? 'stone2' : 'stone';
          if (z < 1) return 'stone';
          return z < 2.6
            ? Math.sin(x * 1.3) * Math.cos(y * 1.7) > 0.45
              ? 'water2'
              : 'water'
            : null;
        }
        // the stem and the bowl on top of it, brimming
        if (z < 8) return r < 1.3 ? 'stone2' : null;
        if (z < 10)
          return r < 1.6 + (z - 8) * 1.3 ? (r > 0.8 + (z - 8) * 1.3 ? 'stone' : 'water2') : null;
        return z < 11 && r < 1 ? 'water2' : null;
      },
    },
    materials: {
      water: ['#2b8fd0', '#48b4ec', '#9be0ff'],
      water2: ['#6cc6f2', '#a8e4ff', '#ffffff'],
    },
  },
};
export default look;
