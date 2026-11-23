import type { Tones } from '@demodogs/shared';
import { hash3 } from './shapes';

/** Shared shapes for the harbour props. Pure. */

/** Container paints: the body, and the darker tone of its frame and corrugation. */
export const BOX_TONES: Record<string, Tones> = {
  boxr: ['#5e2018', '#8a3424', '#b04a32'],
  boxr2: ['#3e150f', '#5a2219', '#74301f'],
  boxt: ['#14454a', '#1f6870', '#2f8f96'],
  boxt2: ['#0c2e32', '#14454a', '#1f6870'],
};

/** Container size, art px: 15 long, 7.6 wide, 8 high. */
export const BOX = { w: 16, h: 8, layers: 8 } as const;

/**
 * A shipping container with its floor at z = 0: corrugated sides, a heavier frame on every edge,
 * doors with locking bars at the +x end, a ribbed roof, and a dark hollow inside that shows once
 * it is holed.
 */
export function box(x: number, y: number, z: number, paint: string, dark: string): string | null {
  const L = 7.5;
  const W = 3.8;
  const H = 7.8;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  if (ax > L || ay > W || z < 0 || z > H) return null;
  const ex = ax > L - 0.6;
  const ey = ay > W - 0.55;
  const ez = z > H - 0.6 || z < 0.6;
  if (Number(ex) + Number(ey) + Number(ez) >= 2) return dark;
  // inside: hollow, dark
  if (!ex && !ey && !ez) return 'black';
  if (z > H - 0.6) return (x + 40) % 1.6 < 0.35 ? dark : paint;
  if (ez) return dark;
  if (x > L - 0.6) {
    // the doors: a seam down the middle and two locking bars on each
    if (ay < 0.2) return dark;
    if (Math.abs(ay - 1.1) < 0.18 || Math.abs(ay - 2.7) < 0.18) return 'band';
    return paint;
  }
  if (x < -L + 0.6) return (y + 40) % 1.2 < 0.3 ? dark : paint;
  // the long sides: corrugated, with the odd rust streak running down
  if ((x + 40) % 1.1 < 0.35) return dark;
  if (hash3(Math.floor(x * 2), y > 0 ? 1 : 2, 7) < 0.06 && z < H - 2) return 'rust';
  return paint;
}
