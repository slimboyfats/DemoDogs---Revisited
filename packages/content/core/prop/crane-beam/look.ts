import type { LookModule } from '@demodogs/shared';

/**
 * A length of gantry, high up: two lattice box girders (top and bottom chords joined by
 * diagonals) with a rail along each, and a cross tie between them. Pieces join end to end.
 */
const look: LookModule = {
  id: 'prop.crane-beam',
  look: {
    kind: 'prop',
    part: {
      w: 14,
      h: 26,
      layers: 36,
      smooth: true,
      fn: (x, y, z) => {
        if (z < 30.4 || z > 34.8 || Math.abs(x) > 7) return null;
        const ay = Math.abs(y);
        // the cross tie
        if (Math.abs(x) < 0.9 && ay < 9.6) return z > 32 && z < 33.6 ? 'hazard' : null;
        if (ay < 9.4 || ay > 12.6) return null;
        if (z > 34.2) return Math.abs(ay - 11) < 0.35 ? 'chrome' : null;
        if (z > 33.4 || z < 31.2) return 'hazard';
        // the faces between the chords: diagonals only
        if (Math.abs(ay - 9.6) > 0.35 && Math.abs(ay - 12.4) > 0.35) return null;
        const u = (x + 70) % 3.4;
        const t = (z - 31.2) * 1.55;
        return Math.abs(u - t) < 0.45 || Math.abs(u - (3.4 - t)) < 0.45 ? 'amber' : null;
      },
    },
  },
};
export default look;
