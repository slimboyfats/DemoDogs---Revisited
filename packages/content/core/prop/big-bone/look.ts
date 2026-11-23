import type { LookModule } from '@demodogs/shared';

/**
 * A great bone lying on its side: a shaft that thins towards the middle and a pair of knuckles at
 * each end, with a dark crack or two along it. +x runs along the shaft.
 */
const look: LookModule = {
  id: 'prop.big-bone',
  look: {
    kind: 'prop',
    materials: {
      bone: ['#a89c80', '#ddd2b4', '#f7f1dd'],
      bone2: ['#8a7f66', '#bfb394', '#e3d9bc'],
    },
    part: {
      w: 15,
      h: 8,
      layers: 4,
      smooth: true,
      fn: (x, y, z) => {
        const ax = Math.abs(x);
        const dz = z - 1.9;
        // the knuckles: two balls side by side at each end
        const k = Math.hypot(ax - 5.4, Math.abs(y) - 1.5, dz * 1.05);
        if (k < 1.95) return k > 1.5 && dz < 0 ? 'bone2' : 'bone';
        if (ax > 5.6) return null;
        // the shaft, waisted in the middle
        const r = 1.05 + 0.45 * (ax / 5.6) ** 2;
        const d = Math.hypot(y, dz);
        if (d > r) return null;
        if (dz > 0.3 && Math.abs(y + x * 0.12) < 0.22 && ax < 3.4) return 'bone2';
        return dz < -0.4 ? 'bone2' : 'bone';
      },
    },
  },
};
export default look;
