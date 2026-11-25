import type { LookModule } from '@demodogs/shared';
import { rr } from '../../../src/shapes';

/** The barrel's axis: from its breech low at the back to its mouth high at the front. */
const A = [-5, 0, 10.4] as const;
const B = [14, 0, 19.2] as const;
const LEN = Math.hypot(B[0] - A[0], B[2] - A[2]);
const UX = (B[0] - A[0]) / LEN;
const UZ = (B[2] - A[2]) / LEN;

/** The balls waiting in the cage: x, y, z. */
const BALLS = [
  [-13.4, -4, 4.6],
  [-13.4, 2.6, 4.6],
  [-7.6, -3.4, 4.6],
  [-7.6, 3.8, 4.6],
  [-10.4, 0, 6.6],
] as const;

/** Is `v` on a bar of a lattice `step` apart? */
const bar = (v: number, step: number): boolean =>
  Math.abs((((v % step) + step) % step) - 0.35) < 0.35;

/**
 * A ball launcher: a long yellow barrel banded in black with a bell muzzle, on a dark steel turret with
 * short yellow struts, a low open cage of tennis balls behind it, on a slab of paving stones. Built small and
 * drawn more than three times the size, so it stands over the cars as a chunky machine.
 */
const look: LookModule = {
  id: 'prop.ball-launcher',
  look: {
    kind: 'prop',
    scale: 3.6,
    fine: 2,
    materials: {
      launch: ['#d8a400', '#ffd000', '#ffe866'],
      launch2: ['#9c7400', '#d09c00', '#f0c020'],
      band: ['#141418', '#22232a', '#34363f'],
      tennis: ['#93b410', '#c8e428', '#ecfa62'],
      slab: ['#7d7e76', '#a9aaa0', '#cfd0c6'],
      slab2: ['#6a6b63', '#93948b', '#b8b9ae'],
      steel: ['#23272e', '#383e48', '#535b67'],
      steel2: ['#2e333c', '#474e5a', '#666f7c'],
    },
    part: {
      w: 38,
      h: 22,
      layers: 28,
      smooth: true,
      fn: (x, y, z) => {
        // the slab: paving stones, every other one a shade darker
        if (z < 1.6) {
          if (!rr(x, y, 18.4, 10.6, 1)) return null;
          const row = Math.floor((y + 20) / 3.2);
          const col = Math.floor((x + 30 + (row & 1) * 2.4) / 4.8);
          return (row + col) & 1 ? 'slab' : 'slab2';
        }
        // along the barrel and out from its axis
        const t = (x - A[0]) * UX + (z - A[2]) * UZ;
        const up = -(x - A[0]) * UZ + (z - A[2]) * UX;
        // (a square barrel: its section is a box, as everything in the park is)
        const off = Math.max(Math.abs(y), Math.abs(up));
        if (t > -1.6 && t < LEN) {
          // the ball sitting in the mouth
          if (Math.hypot(t - (LEN - 0.4), y, up) < 3.8) return 'tennis';
          // the muzzle: a bell flaring out to a fat yellow ring at the front
          const bell = t > LEN - 4.5 ? 6.2 : 4.6;
          if (off < bell && (t < LEN - 1.2 || off > 3.6)) {
            if (t < 0.6) return 'band';
            if (t > LEN - 1.8) return up < -3 ? 'launch2' : 'launch';
            // black bands round it and a darker yellow underneath
            if (Math.abs(t - 4.4) < 0.9 || Math.abs(t - 9.6) < 0.9 || Math.abs(t - 14.8) < 0.9)
              return 'band';
            return up < -2.6 ? 'launch2' : 'launch';
          }
        }
        // the mount: a dark steel turret under the barrel's middle, stepping in as it rises to
        // the pivot the barrel turns on, with a short yellow strut at each corner of its foot
        const mx = Math.abs(x - 5);
        const my = Math.abs(y);
        if (z < 10.5 && mx < 6.4 - Math.floor(z / 3) * 0.9 && my < 6.6 - Math.floor(z / 3) * 0.7)
          return Math.floor(z / 3) & 1 ? 'steel2' : 'steel';
        if (Math.abs(x - 5) < 2.2 && Math.abs(z - 11) < 2.2 && my < 6.4) return 'steel';
        if (z < 4.6 && Math.abs(my - 6.6) < 1.1 && Math.abs(mx - (8.6 - z * 0.7)) < 1)
          return 'launch';
        // the cage behind: low, an open lattice of thin dark bars, the balls showing through
        if (x > -17 && x < -3.4 && Math.abs(y) < 7.6 && z < 9.2) {
          for (const [bx, by, bz] of BALLS)
            if (Math.hypot(x - bx, y - by, z - bz) < 2.9) return 'tennis';
          const ends = x < -16.3 || x > -4.1;
          const sides = Math.abs(y) > 6.9;
          const lid = z > 8.5;
          const walls = Number(ends) + Number(sides) + Number(lid);
          // (its edges whole, its faces barred far apart)
          if (walls >= 2) return 'steel';
          if (walls === 1) {
            const bx = bar(x + 16.6, 4.2);
            const by = bar(y + 7.3, 4.7);
            const bz = bar(z - 1.6, 7);
            if (ends ? by || bz : sides ? bx || bz : bx || by) return 'steel';
          }
        }
        return null;
      },
    },
  },
};
export default look;
