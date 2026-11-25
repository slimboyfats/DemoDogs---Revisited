import type { LookModule } from '@demodogs/shared';

/** A little plank bridge with a low rail each side: the way into the park through the hedge. */
const look: LookModule = {
  id: 'prop.plank-bridge',
  look: {
    kind: 'prop',
    scale: 1.5,
    materials: {
      deckwood: ['#7a5228', '#a8763c', '#cf9a56'],
      deckwood2: ['#6a4520', '#946632', '#b98848'],
      deckpost: ['#4e3018', '#6e4622', '#8a5a2c'],
    },
    part: {
      w: 20,
      h: 14,
      layers: 6,
      smooth: true,
      fn: (x, y, z) => {
        if (Math.abs(x) > 9.6 || Math.abs(y) > 6.6) return null;
        // the deck: planks across, humped a little in the middle
        const hump = 1.6 - (x * x) / 70;
        if (z < hump + 0.9 && z > hump - 0.4 && Math.abs(y) < 5.6)
          return Math.abs(((x + 20) % 2.4) - 1.2) > 1.05
            ? null
            : Math.floor((x + 20) / 2.4) % 2
              ? 'deckwood'
              : 'deckwood2';
        // a rail each side on three posts
        if (Math.abs(Math.abs(y) - 6) < 0.6) {
          if (Math.abs(Math.abs(x) - 8.6) < 0.6 || Math.abs(x) < 0.6)
            return z < 5.4 ? 'deckpost' : null;
          return Math.abs(z - 4.4) < 0.5 ? 'deckwood' : null;
        }
        return null;
      },
    },
  },
};
export default look;
