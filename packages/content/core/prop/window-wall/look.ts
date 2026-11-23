import type { LookModule } from '@demodogs/shared';

/** A window: a low brick sill, a pane of glass in a timber frame, a lintel over it. */
const look: LookModule = {
  id: 'prop.window-wall',
  look: {
    kind: 'prop',
    part: {
      w: 9,
      h: 4,
      layers: 10,
      fn: (x, y, z) => {
        if (Math.abs(x) > 4.5 || Math.abs(y) > 1.7 || z > 9.6) return null;
        if (z < 3) return z % 1.5 < 0.22 ? 'concrete' : 'barrel';
        if (z > 8.4) return 'concrete';
        if (Math.abs(x) > 3.8 || z < 3.6 || z > 7.9 || Math.abs(x) < 0.3) return 'wood2';
        return Math.abs(y) < 0.5 ? (((x + z) | 0) % 4 === 0 ? 'glasshi' : 'glass') : null;
      },
    },
  },
};
export default look;
