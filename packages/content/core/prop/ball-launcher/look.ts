import type { LookModule } from '@demodogs/shared';
import { rr } from '../../../src/shapes';

/** The barrel's axis: from its breech low at the back to its mouth high at the front. */
const A = [-5, 0, 8.5] as const;
const B = [9.5, 0, 14.5] as const;
const LEN = Math.hypot(B[0] - A[0], B[2] - A[2]);
const UX = (B[0] - A[0]) / LEN;
const UZ = (B[2] - A[2]) / LEN;

/**
 * A ball launcher: a fat yellow barrel tipped up on a steel and yellow cradle, a tennis ball in
 * its mouth and a cage of them behind, on a slab of paving stones. Built small and drawn more
 * than twice the size, so it stands over the cars as a great chunky machine.
 */
const look: LookModule = {
  id: 'prop.ball-launcher',
  look: {
    kind: 'prop',
    scale: 2.2,
    materials: {
      launch: ['#b98a08', '#f2bc10', '#ffdc4e'],
      launch2: ['#8a6406', '#c28f0a', '#e6b62a'],
      tennis: ['#93b410', '#c8e428', '#ecfa62'],
      slab: ['#77786f', '#a3a49a', '#c9cabf'],
      slab2: ['#66675f', '#8f9087', '#b4b5aa'],
      steel: ['#2b3038', '#444b56', '#636c79'],
    },
    part: {
      w: 27,
      h: 20,
      layers: 20,
      smooth: true,
      fn: (x, y, z) => {
        // the slab: paving stones, every other one a shade darker
        if (z < 1.6) {
          if (!rr(x, y, 13, 9.5, 1)) return null;
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
          if (Math.hypot(t - (LEN - 0.4), off) < 3.5) return 'tennis';
          if (off < 4.6 && t < LEN - 1.2) {
            if (t < 0) return 'steel';
            // dark bands round it, a fat rim at the mouth, and a darker yellow underneath
            if (Math.abs(t - 3.5) < 0.8 || Math.abs(t - 9) < 0.8) return 'steel';
            return up < -2.2 ? 'launch2' : 'launch';
          }
          if (off < 5.3 && t > LEN - 3.4 && off > 3.4) return 'launch2';
        }
        // the cradle: a steel post at each corner, a yellow A-frame each side, beams across
        const side = Math.abs(Math.abs(y) - 6.3) < 0.9;
        if (side && z < 12.5) {
          if (Math.abs(Math.abs(x - 1.5) - 6.5) < 0.8 && z < 9) return 'steel';
          if (Math.abs(Math.abs(x - 1.5) - (12.5 - z) * 0.6) < 0.9) return 'launch';
          if (Math.abs(z - 5.2) < 0.6 && Math.abs(x - 1.5) < 7) return 'steel';
        }
        if (Math.abs(z - 11.6) < 0.8 && Math.abs(x - 1.5) < 0.9 && Math.abs(y) < 6.8)
          return 'steel';
        if (Math.abs(z - 2.2) < 0.6 && Math.abs(Math.abs(x - 1.5) - 6.5) < 0.7 && Math.abs(y) < 6.8)
          return 'steel';
        // the cage of balls behind: bars round three balls
        if (x < -6 && x > -12.6 && Math.abs(y) < 5.4 && z < 8.2) {
          for (const [bx, by, bz] of [
            [-9.4, -2.5, 4.1],
            [-9.4, 2.5, 4.1],
            [-9.4, 0, 6],
          ] as const)
            if (Math.hypot(x - bx, y - by, z - bz) < 2.5) return 'tennis';
          const wall = x < -11.9 || x > -6.7 || Math.abs(y) > 4.7 || z > 7.5;
          const bar =
            Math.abs(((x + 30) % 2.9) - 1.45) > 1.05 ||
            Math.abs(((y + 30) % 2.9) - 1.45) > 1.05 ||
            Math.abs((z % 2.9) - 1.45) > 1.05;
          if (wall && bar) return 'steel';
        }
        return null;
      },
    },
  },
};
export default look;
