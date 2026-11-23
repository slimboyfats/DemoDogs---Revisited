import type { LookModule } from '@demodogs/shared';

/**
 * The digger, as much of it as shows: a hump of turned earth with a steel drill point breaking
 * out of the front of it.
 */
const look: LookModule = {
  id: 'weapon.mole',
  look: {
    kind: 'prop',
    part: {
      w: 11,
      h: 8,
      layers: 4,
      smooth: true,
      fn: (x, y, z) => {
        // the drill: a cone along the nose, banded so it reads as turning
        if (x > 1.6) {
          const rc = Math.max(0, 1.5 * (1 - (x - 1.6) / 3.6));
          if (Math.hypot(y, z - 1.3) > rc) return null;
          return ((x * 2.2) | 0) & 1 ? 'chrome' : 'band';
        }
        // the hump: lumpy earth, darker where it is freshly turned
        const lump = 0.35 * Math.sin(x * 2.1 + y * 1.3) * Math.cos(y * 2.4 - x);
        const e = Math.hypot((x + 1.4) / 4, y / 3.3, z / (2.9 + lump));
        if (e > 1) return null;
        return e > 0.8 ? (lump > 0 ? 'wood2' : 'rust2') : 'bark2';
      },
    },
  },
};
export default look;
