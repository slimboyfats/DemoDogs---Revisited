import type { LookModule } from '@demodogs/shared';

/** A length of park fence: three broad flat planks side by side, on two rails behind them. */
const look: LookModule = {
  id: 'prop.rail-fence',
  look: {
    kind: 'prop',
    scale: 2,
    materials: {
      rail: ['#7a5228', '#a8763c', '#cf9a56'],
      railpost: ['#62401e', '#8a5c2c', '#b07c42'],
    },
    part: {
      w: 7,
      h: 2,
      layers: 7,
      smooth: true,
      fn: (x, y, z) => {
        // planks a third of its length apart, so one length runs on into the next
        const dx = Math.abs(((((x + 3.5) % (7 / 3)) + 7 / 3) % (7 / 3)) - 7 / 6);
        if (dx < 0.78 && y > -0.2 && y < 0.7) return z < 6.2 ? 'rail' : null;
        if (y > -0.9 && y <= -0.2)
          return Math.abs(z - 2.1) < 0.55 || Math.abs(z - 4.5) < 0.55 ? 'railpost' : null;
        return null;
      },
    },
  },
};
export default look;
