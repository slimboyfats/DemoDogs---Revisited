import type { LookModule } from '@demodogs/shared';

/** A water tower: four splayed steel legs with cross braces, a round tank and a cone roof. */
const look: LookModule = {
  id: 'prop.water-tower',
  look: {
    kind: 'prop',
    part: {
      w: 16,
      h: 16,
      layers: 26,
      smooth: true,
      fn: (x, y, z) => {
        const r = Math.hypot(x, y);
        if (z < 14) {
          // legs splay outward towards the ground, with a brace half way up
          const out = 4.2 + (14 - z) * 0.16;
          const leg = Math.abs(Math.abs(x) - out) < 0.6 && Math.abs(Math.abs(y) - out) < 0.6;
          if (leg) return 'rust2';
          const brace =
            Math.abs(z - 7) < 0.4 &&
            (Math.abs(Math.abs(x) - out) < 0.4 || Math.abs(Math.abs(y) - out) < 0.4);
          return brace && Math.abs(x) <= out && Math.abs(y) <= out ? 'rust' : null;
        }
        if (z < 22) {
          if (r > 6.6) return null;
          if (Math.abs(z - 15) < 0.5 || Math.abs(z - 21) < 0.5) return 'band';
          return ((Math.atan2(y, x) * 5 + 20) | 0) % 5 === 0 ? 'rust' : 'bumper';
        }
        return r < (26 - z) * 1.7 ? 'rust2' : null;
      },
    },
  },
};
export default look;
