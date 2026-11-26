import type { LookModule } from '@demodogs/shared';
import { BAY } from '../../../src/themes';

/** Fronds: which way each points, how long it is and how far its tip droops. */
const FRONDS = [0.2, 1.1, 2.0, 2.9, 3.8, 4.7, 5.6].map(
  (a, k) => [a, 9.6 - (k % 3) * 0.9, 4.2 + (k % 2) * 1.6] as const,
);
const TOP = 21;
/** How far the trunk leans off its foot at height z. */
const lean = (z: number): number => 2.6 * (z / TOP) ** 2;

/** A palm: a ringed trunk that leans as it climbs, seven drooping fronds, coconuts under them. */
const look: LookModule = {
  id: 'prop.palm',
  look: {
    kind: 'prop',
    materials: BAY,
    part: {
      w: 26,
      h: 26,
      layers: 25,
      smooth: true,
      fn: (x, y, z) => {
        const tx = x - lean(Math.min(z, TOP));
        if (z < TOP && Math.hypot(tx, y) < 1.5 - z * 0.022)
          return z % 2.4 < 0.5 ? 'trunk2' : 'trunk';
        // coconuts, tucked under the crown
        if (Math.hypot(tx - 1.2, y - 0.9, z - TOP + 1.4) < 1.15) return 'trunk2';
        if (Math.hypot(tx + 1, y + 1.1, z - TOP + 1.6) < 1.1) return 'trunk2';
        const r = Math.hypot(tx, y);
        if (r > 10.5 || z < TOP - 6.5) return null;
        const a = Math.atan2(y, tx);
        for (const [fa, len, droop] of FRONDS) {
          let d = a - fa;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          if (Math.abs(d) > 1) continue;
          const along = r * Math.cos(d);
          const across = r * Math.sin(d);
          if (along < 0 || along > len) continue;
          const t = along / len;
          // it rises a little off the trunk and then hangs
          const fz = TOP + 1.6 + 2.2 * t - droop * t * t * 1.9;
          const wide = 2.5 * Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.1)) + 0.25;
          if (Math.abs(across) > wide || Math.abs(z - fz) > 0.62) continue;
          if (Math.abs(across) < 0.3) return 'frond2';
          // the leaflets: cut into the edge
          if (Math.abs(across) > wide * 0.55 && (along * 1.6) % 1 < 0.3) return null;
          return t > 0.55 ? 'frond2' : 'frond';
        }
        return null;
      },
    },
  },
};
export default look;
