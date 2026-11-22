import type { LookModule } from '@demodogs/shared';

/** The rocket in flight: white body, red nose and fins. */
const look: LookModule = {
  id: 'weapon.rocket',
  look: {
    kind: 'prop',
    part: {
      w: 8,
      h: 4,
      layers: 2,
      fn: (x, y) =>
        x < -2.5
          ? Math.abs(y) < 1.9
            ? 'tail'
            : null
          : Math.abs(y) > 1
            ? null
            : x > 2.4
              ? 'tail'
              : 'rocket',
    },
  },
};
export default look;
