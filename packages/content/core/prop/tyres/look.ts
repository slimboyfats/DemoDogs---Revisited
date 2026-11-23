import type { LookModule, ShapeFn } from '@demodogs/shared';

/**
 * Three tyres stacked: each a fat ring with a rounded wall and tread blocks round the outside.
 * `paint(n)` names the material of tyre n (0 at the bottom).
 */
export const tyreStack =
  (paint: (n: number) => string, tread: string): ShapeFn =>
  (x, y, z) => {
    const n = Math.min(2, Math.floor(z / 2));
    const zc = z - n * 2 - 1;
    const r = Math.hypot(x, y);
    // the tyre's cross-section: a rounded tube, squashed a little
    const q = Math.hypot((r - 3.25) / 1.5, zc / 1.02);
    if (q > 1) return null;
    if (r > 4.25) {
      const a = Math.atan2(y, x) / (Math.PI * 2) + 0.5 + n * 0.03;
      if ((((a * 22) % 1) + 1) % 1 < 0.42) return r > 4.5 ? null : tread;
    }
    return paint(n);
  };

const look: LookModule = {
  id: 'prop.tyres',
  look: {
    kind: 'prop',
    part: { w: 10, h: 10, layers: 6, smooth: true, fn: tyreStack(() => 'rubber', 'tire') },
  },
};
export default look;
