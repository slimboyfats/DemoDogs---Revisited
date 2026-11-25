import type { LookModule } from '@demodogs/shared';
import { rr } from '../../../src/shapes';

/** The barrel's axis: from its breech low at the back to its mouth high at the front. */
const A = [-9, 0, 12.5] as const;
const B = [13, 0, 20] as const;
const LEN = Math.hypot(B[0] - A[0], B[2] - A[2]);
const UX = (B[0] - A[0]) / LEN;
const UZ = (B[2] - A[2]) / LEN;

/** The balls waiting in the cage: x, y, z. */
const BALLS = [
  [-10.6, -4, 4.6],
  [-10.6, 2.6, 4.6],
  [-4.4, -3.4, 4.6],
  [-4.4, 3.6, 4.6],
  [1, -1, 4.6],
  [-7.6, 0, 7.8],
  [-1.6, 1, 7.8],
] as const;

/** Is `v` on a bar of a lattice `step` apart? */
const bar = (v: number, step: number): boolean =>
  Math.abs((((v % step) + step) % step) - 0.5) < 0.5;

/**
 * A ball launcher: a long yellow barrel banded in black, tipped up over a dark steel cage full of
 * tennis balls, on angled yellow legs, on a slab of paving stones. Built small and drawn more
 * than three times the size, so it stands over the cars as a chunky machine.
 */
const look: LookModule = {
  id: 'prop.ball-launcher',
  look: {
    kind: 'prop',
    scale: 3.6,
    materials: {
      launch: ['#d8a400', '#ffd000', '#ffe866'],
      launch2: ['#9c7400', '#d09c00', '#f0c020'],
      band: ['#141418', '#22232a', '#34363f'],
      tennis: ['#93b410', '#c8e428', '#ecfa62'],
      slab: ['#7d7e76', '#a9aaa0', '#cfd0c6'],
      slab2: ['#6a6b63', '#93948b', '#b8b9ae'],
      steel: ['#23272e', '#383e48', '#535b67'],
    },
    part: {
      w: 34,
      h: 22,
      layers: 27,
      smooth: true,
      fn: (x, y, z) => {
        // the slab: paving stones, every other one a shade darker
        if (z < 1.6) {
          if (!rr(x, y, 16.4, 10.6, 1)) return null;
          const row = Math.floor((y + 20) / 3.2);
          const col = Math.floor((x + 30 + (row & 1) * 2.4) / 4.8);
          return (row + col) & 1 ? 'slab' : 'slab2';
        }
        // along the barrel and out from its axis
        const t = (x - A[0]) * UX + (z - A[2]) * UZ;
        const up = -(x - A[0]) * UZ + (z - A[2]) * UX;
        const off = Math.hypot(y, up);
        if (t > -1.6 && t < LEN) {
          // the ball sitting in the mouth
          if (Math.hypot(t - (LEN - 0.6), off) < 3.3) return 'tennis';
          if (off < 4.3 && t < LEN - 1.2) {
            if (t < 0) return 'band';
            // black bands round it and a darker yellow underneath
            if (Math.abs(t - 4) < 0.8 || Math.abs(t - 10) < 0.8 || Math.abs(t - 16) < 0.8)
              return 'band';
            return up < -2.2 ? 'launch2' : 'launch';
          }
          // a fat rim at the mouth
          if (off < 5.3 && t > LEN - 3 && off > 3.2) return up < -2.6 ? 'launch2' : 'launch';
        }
        // an angled yellow leg fore and aft each side, up to the barrel's pivot, and the axle
        if (Math.abs(Math.abs(y) - 9.2) < 0.8 && z < 15) {
          if (Math.abs(Math.abs(x - 2) - (15 - z) * 0.72) < 0.9) return 'launch';
          if (Math.abs(z - 6) < 0.6 && Math.abs(x - 2) < 6.4) return 'launch2';
        }
        if (Math.hypot(x - 2, z - 14.4) < 1 && Math.abs(y) < 10) return 'steel';
        // the cage: an open lattice of dark steel bars, the balls showing through
        if (x > -14.6 && x < 4.6 && Math.abs(y) < 7.8 && z < 11) {
          for (const [bx, by, bz] of BALLS)
            if (Math.hypot(x - bx, y - by, z - bz) < 2.9) return 'tennis';
          const ends = x < -13.6 || x > 3.6;
          const sides = Math.abs(y) > 6.8;
          const lid = z > 10;
          const walls = Number(ends) + Number(sides) + Number(lid);
          // (its edges whole, its faces barred)
          if (walls >= 2) return 'steel';
          if (walls === 1) {
            const bx = bar(x + 14.1, 3.54);
            const by = bar(y + 7.3, 3.65);
            const bz = bar(z - 1.6, 4.2);
            if (ends ? by || bz : sides ? bx || bz : bx || by) return 'steel';
          }
        }
        return null;
      },
    },
  },
};
export default look;
