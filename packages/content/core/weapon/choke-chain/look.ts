import type { LookModule } from '@demodogs/shared';

/** The flail's ball: dark iron, studded all over with steel spikes, a ring on top for the chain. */
const look: LookModule = {
  id: 'weapon.choke-chain',
  look: {
    kind: 'prop',
    part: {
      w: 11,
      h: 11,
      layers: 10,
      smooth: true,
      fn: (x, y, z) => {
        const zc = z - 5;
        const r = Math.hypot(x, y, zc);
        if (r < 3.3) return r > 2.8 && Math.abs(zc) < 0.5 ? 'band' : 'mine';
        if (r > 5.2) return null;
        // spikes: along each axis and each diagonal of the flat, thinning to a point
        const thin = 0.95 * (1 - (r - 3.3) / 1.9);
        const ax = Math.abs(x);
        const ay = Math.abs(y);
        const az = Math.abs(zc);
        const off = Math.min(
          Math.hypot(ay, az),
          Math.hypot(ax, az),
          Math.hypot(ax, ay),
          Math.hypot(ax - ay, az * 1.4) * 0.72,
        );
        return off < thin ? 'chrome' : null;
      },
    },
  },
};
export default look;
