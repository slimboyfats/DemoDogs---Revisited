/**
 * Shell stacks, after loktar00's sprite-stack-engine (js/art.js, MIT): a texel deep inside a solid
 * can never be seen, because the layer above (or the texels around it) always cover it. The overdraw
 * meter uses this to say how many fragments a shelled atlas would save, without changing the art.
 */

/** The layout of a strip's slices in its image: slice i at ((i % cols) * cw, floor(i / cols) * ch). */
export interface ShellLayout {
  cw: number;
  ch: number;
  n: number;
  cols: number;
}

/**
 * The strip's pixels with the interior left out: a texel is dropped when every texel within `depth`
 * of it (a square, in its own slice and in the slices just above and below) is filled. Above the top
 * slice is empty; below the bottom one counts as filled (the ground). The slice's edge is empty.
 */
export function shellPixels(
  px: Uint8ClampedArray,
  imgW: number,
  s: ShellLayout,
  depth = 3,
): Uint8ClampedArray {
  const { cw, ch, n, cols } = s;
  const out = new Uint8ClampedArray(px);
  // per slice: a summed-area table of filled texels, so "is this square all filled" is O(1)
  const W = cw + 1;
  const sat: Int32Array[] = [];
  for (let i = 0; i < n; i++) {
    const ox = (i % cols) * cw;
    const oy = Math.floor(i / cols) * ch;
    const t = new Int32Array(W * (ch + 1));
    for (let y = 0; y < ch; y++) {
      let row = 0;
      for (let x = 0; x < cw; x++) {
        row += px[((oy + y) * imgW + ox + x) * 4 + 3]! >= 128 ? 1 : 0;
        t[(y + 1) * W + x + 1] = t[y * W + x + 1]! + row;
      }
    }
    sat.push(t);
  }
  const full = (i: number, x: number, y: number): boolean => {
    if (i < 0) return true;
    if (i >= n) return false;
    const x0 = x - depth;
    const y0 = y - depth;
    const x1 = x + depth + 1;
    const y1 = y + depth + 1;
    if (x0 < 0 || y0 < 0 || x1 > cw || y1 > ch) return false;
    const t = sat[i]!;
    const sum = t[y1 * W + x1]! - t[y0 * W + x1]! - t[y1 * W + x0]! + t[y0 * W + x0]!;
    return sum === (x1 - x0) * (y1 - y0);
  };
  for (let i = 0; i < n; i++) {
    const ox = (i % cols) * cw;
    const oy = Math.floor(i / cols) * ch;
    for (let y = depth; y < ch - depth; y++)
      for (let x = depth; x < cw - depth; x++)
        if (full(i, x, y) && full(i + 1, x, y) && full(i - 1, x, y))
          out[((oy + y) * imgW + ox + x) * 4 + 3] = 0;
  }
  return out;
}
