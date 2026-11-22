import type { LookModule } from '@demodogs/shared';

/** The Sniffer in flight: a long gunmetal tube with a glowing seeker eye and amber fins. */
const look: LookModule = {
  id: 'weapon.sniffer',
  look: {
    kind: 'prop',
    part: {
      w: 10,
      h: 4,
      layers: 2,
      smooth: true,
      fn: (x, y, z) => {
        const zc = z - 1;
        const r = Math.hypot(y, zc);
        // swept fins at the tail, flat and upright
        if (x < -2.4 && x > -4.8) {
          const span = 1.8 * Math.min(1, (x + 4.9) / 1.6 + 0.3);
          if (
            (Math.abs(zc) < 0.2 && Math.abs(y) < span) ||
            (Math.abs(y) < 0.2 && Math.abs(zc) < 0.9)
          )
            return 'amber';
        }
        if (x < -4.4) return r < 0.45 ? 'black' : null;
        const rad = x > 2.8 ? Math.max(0, 0.75 * (1 - (x - 2.8) / 2.2)) : 0.75;
        if (r > rad) return null;
        if (x > 3.4) return 'glow';
        return Math.abs(x - 2.2) < 0.3 || Math.abs(x + 1.6) < 0.25 ? 'amber' : 'mine';
      },
    },
  },
};
export default look;
