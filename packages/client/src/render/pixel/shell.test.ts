import { describe, expect, it } from 'vitest';
import { shellPixels } from './shell';

/** A solid block cw x ch x n, slices side by side in one row. */
function block(cw: number, ch: number, n: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(cw * n * ch * 4);
  for (let i = 3; i < px.length; i += 4) px[i] = 255;
  return px;
}
const filled = (px: Uint8ClampedArray) => {
  let k = 0;
  for (let i = 3; i < px.length; i += 4) if (px[i]! >= 128) k++;
  return k;
};

describe('shellPixels', () => {
  it('keeps every texel of a thin object', () => {
    const px = block(6, 6, 4);
    expect(filled(shellPixels(px, 24, { cw: 6, ch: 6, n: 4, cols: 4 }))).toBe(6 * 6 * 4);
  });

  it('drops the core of a big solid but keeps its skin and its top', () => {
    const n = 6;
    const px = block(12, 12, n);
    const out = shellPixels(px, 12 * n, { cw: 12, ch: 12, n, cols: n });
    // the interior square is 6 x 6 per slice; the top slice and the one under it stay whole
    expect(filled(out)).toBe(12 * 12 * n - 36 * (n - 1));
    // top slice untouched
    const top = (n - 1) * 12;
    for (let y = 0; y < 12; y++)
      for (let x = 0; x < 12; x++) expect(out[(y * 12 * n + top + x) * 4 + 3]).toBe(255);
  });

  it('keeps a texel near a hole in the slice above', () => {
    const n = 3;
    const px = block(12, 12, n);
    // a hole in the middle slice at (6, 6)
    px[(6 * 12 * n + 12 + 6) * 4 + 3] = 0;
    const out = shellPixels(px, 12 * n, { cw: 12, ch: 12, n, cols: n });
    // the bottom slice's (6, 6) has the hole above it within reach: kept
    expect(out[(6 * 12 * n + 6) * 4 + 3]).toBe(255);
  });
});
