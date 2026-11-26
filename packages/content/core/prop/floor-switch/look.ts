import type { LookModule } from '@demodogs/shared';

/** A floor switch: a dark plate with a blue rim and a round blue button in the middle. */
const look: LookModule = {
  id: 'prop.floor-switch',
  look: {
    kind: 'prop',
    part: {
      w: 28,
      h: 28,
      layers: 2,
      fn: (x, y, z) => {
        const r = Math.hypot(x, y);
        if (Math.abs(x) > 13.5 || Math.abs(y) > 13.5) return null;
        if (z > 0) return r < 6 ? 'turbohot' : null;
        if (Math.abs(x) > 11.5 || Math.abs(y) > 11.5) return 'turbowarm';
        if (r < 7.5) return 'turbowarm';
        return 'padbase';
      },
    },
  },
};
export default look;
