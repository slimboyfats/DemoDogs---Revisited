import type { LookModule } from '@demodogs/shared';

/** A snowman: three balls of snow, coal buttons and eyes, a carrot, a black hat. */
const look: LookModule = {
  id: 'prop.snowman',
  look: {
    kind: 'prop',
    part: {
      w: 8,
      h: 8,
      layers: 13,
      smooth: true,
      fn: (x, y, z) => {
        const r = Math.hypot(x, y);
        if (z > 10.6) return r < (z < 11 ? 1.9 : 1.1) && z < 12.6 ? 'black' : null;
        for (const [cz, cr] of [
          [2.6, 3],
          [6.2, 2.2],
          [9.2, 1.6],
        ] as const) {
          const d = Math.hypot(x, y, z - cz);
          if (d > cr) continue;
          if (cz > 9 && x > 1 && Math.abs(Math.abs(y) - 0.6) < 0.3 && z > 9.3) return 'black';
          if (cz < 9 && x > cr * 0.9 && Math.abs(y) < 0.35 && Math.floor(z * 1.2) % 2 === 0)
            return 'black';
          return 'snow';
        }
        if (x > 1.2 && x < 3 && Math.abs(y) < 0.35 && Math.abs(z - 9) < 0.35) return 'cone';
        return null;
      },
    },
  },
};
export default look;
