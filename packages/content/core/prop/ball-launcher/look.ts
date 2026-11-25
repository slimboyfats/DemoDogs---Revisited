import type { LookModule } from '@demodogs/shared';
import { rr } from '../../../src/shapes';

/** The barrel's axis: from its breech low at the back to its mouth high at the front. */
const A = [-6.5, 0, 12] as const;
const B = [10.5, 0, 19] as const;
const LEN = Math.hypot(B[0] - A[0], B[2] - A[2]);
const UX = (B[0] - A[0]) / LEN;
const UZ = (B[2] - A[2]) / LEN;

/** The balls waiting in the cage: x, y, z. */
const BALLS = [
  [-9.5, -3, 4.6],
  [-9.5, 3, 4.6],
  [-3.6, -3, 4.6],
  [-3.6, 3, 4.6],
  [-6.6, 0, 7.6],
  [-1, 0, 7.4],
] as const;

/** Is `v` on a bar of a lattice `step` apart? */
const bar = (v: number, step: number): boolean =>
  Math.abs((((v % step) + step) % step) - 0.5) < 0.5;

/**
 * A ball launcher: a great fat yellow barrel tipped up over an open steel cage full of tennis
 * balls, on yellow A-frames, on a slab of paving stones. Built small and drawn more than three
 * times the size, so it stands over the cars as a chunky machine.
 */
const look: LookModule = {
  id: 'prop.ball-launcher',
  look: {
    kind: 'prop',
    scale: 3.6,
    materials: {
      launch: ['#c99406', '#f6c40c', '#ffe24a'],
      launch2: ['#8f6804', '#c79208', '#eab822'],
      tennis: ['#93b410', '#c8e428', '#ecfa62'],
      slab: ['#7d7e76', '#a9aaa0', '#cfd0c6'],
      slab2: ['#6a6b63', '#93948b', '#b8b9ae'],
      steel: ['#2b3038', '#444b56', '#636c79'],
    },
    part: {
      w: 30,
      h: 20,
      layers: 26,
      smooth: true,
      fn: (x, y, z) => {
        // the slab: paving stones, every other one a shade darker
        if (z < 1.6) {
          if (!rr(x, y, 14.5, 9.6, 1)) return null;
          const row = Math.floor((y + 20) / 3.2);
          const col = Math.floor((x + 30 + (row & 1) * 2.4) / 4.8);
          return (row + col) & 1 ? 'slab' : 'slab2';
        }
        // along the barrel and out from its axis
        const t = (x - A[0]) * UX + (z - A[2]) * UZ;
        const up = -(x - A[0]) * UZ + (z - A[2]) * UX;
        const off = Math.hypot(y, up);
        if (t > -2 && t < LEN) {
          // the ball sitting in the mouth
          if (Math.hypot(t - (LEN - 0.6), off) < 3.9) return 'tennis';
          if (off < 5.2 && t < LEN - 1.4) {
            if (t < 0) return 'steel';
            // dark bands round it and a darker yellow underneath
            if (Math.abs(t - 4) < 0.9 || Math.abs(t - 10.5) < 0.9) return 'steel';
            return up < -2.6 ? 'launch2' : 'launch';
          }
          // a fat rim at the mouth
          if (off < 6.1 && t > LEN - 4 && off > 3.8) return up < -3 ? 'launch2' : 'launch';
        }
        // the yellow A-frame each side, up to the barrel's pivot, and the axle across
        if (Math.abs(Math.abs(y) - 7.6) < 1 && z < 14.2) {
          if (Math.abs(Math.abs(x - 1.5) - (14.2 - z) * 0.62) < 1.1) return 'launch';
          if (Math.abs(z - 2.4) < 0.8 && Math.abs(x - 1.5) < 8) return 'launch2';
        }
        if (Math.hypot(x - 1.5, z - 13.4) < 1.1 && Math.abs(y) < 8.4) return 'steel';
        // the cage: an open lattice of steel bars, the balls showing through
        if (x > -13 && x < 1.6 && Math.abs(y) < 6.4 && z < 10.6) {
          for (const [bx, by, bz] of BALLS)
            if (Math.hypot(x - bx, y - by, z - bz) < 2.9) return 'tennis';
          const ends = x < -12 || x > 0.6;
          const sides = Math.abs(y) > 5.4;
          const lid = z > 9.6;
          const walls = Number(ends) + Number(sides) + Number(lid);
          // (its edges whole, its faces barred)
          if (walls >= 2) return 'steel';
          if (walls === 1) {
            const bx = bar(x + 12.5, 4.2);
            const by = bar(y + 5.9, 3.95);
            const bz = bar(z - 1.6, 4);
            if (ends ? by || bz : sides ? bx || bz : bx || by) return 'steel';
          }
        }
        return null;
      },
    },
  },
};
export default look;
