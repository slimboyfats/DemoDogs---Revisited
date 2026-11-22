import type { LookModule } from '@demodogs/shared';

/** Six logs stacked three, two and one, cut ends pale. */
const look: LookModule = {
  id: 'prop.log-pile',
  look: {
    kind: 'prop',
    part: {
      w: 16,
      h: 12,
      layers: 10,
      smooth: true,
      fn: (x, y, z) => {
        if (Math.abs(x) > 7) return null;
        const logs: [number, number][] = [
          [-3.4, 1.7],
          [0, 1.7],
          [3.4, 1.7],
          [-1.7, 4.6],
          [1.7, 4.6],
          [0, 7.5],
        ];
        for (const [ly, lz] of logs) {
          const r = Math.hypot(y - ly, z - lz);
          if (r > 1.75) continue;
          if (Math.abs(x) > 6.2) return r < 0.6 ? 'wood2' : 'wood';
          return ((x * 0.9 + ly * 3 + 40) | 0) % 4 === 0 ? 'bark2' : 'bark';
        }
        return null;
      },
    },
  },
};
export default look;
