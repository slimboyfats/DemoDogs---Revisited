import type { LookModule } from '@demodogs/shared';

/** A flat disc with a domed middle, six prongs and a light (the client blinks `minelit`). */
const look: LookModule = {
  id: 'weapon.mine',
  look: {
    kind: 'prop',
    part: {
      w: 6,
      h: 6,
      layers: 2,
      smooth: true,
      fn: (x, y, z) => {
        const r = Math.hypot(x, y);
        if (r < 0.75 && z > 1.1) return 'minelit';
        if (z < 1 + Math.max(0, 1.6 - r) * 0.45 && r < 2.4) return r > 2.05 ? 'band' : 'mine';
        // prongs round the rim
        const a = Math.atan2(y, x) / (Math.PI * 2) + 0.5;
        return z < 1.3 && r < 2.85 && r > 2.2 && (((a * 6) % 1) + 1) % 1 < 0.3 ? 'band' : null;
      },
    },
  },
};
export default look;
