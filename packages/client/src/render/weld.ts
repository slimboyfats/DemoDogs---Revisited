import type { Chip } from './strips';

/**
 * The field welder, drawn: a dented body gets its voxels back one by one from the car's fresh
 * art, from the floor up, so the dents fill in like beads of weld laid layer on layer. Purely
 * visual; the sim only says how far the welding has got (the car's armour).
 */

/** A strip's pixel layout: RGBA rows `W` wide, slices `cw` by `ch` laid out `cols` to a row. */
export interface Layout {
  W: number;
  cw: number;
  ch: number;
  cols: number;
  res: number;
}

/**
 * Every voxel where `body` differs from `fresh` (knocked off, scuffed or scorched), as pixel
 * indices, lowest layer first and shuffled within a layer or two, so a dent fills from the bottom.
 */
export function weldPlan(
  body: Uint8ClampedArray,
  fresh: Uint8ClampedArray,
  L: Layout,
  rand: () => number,
): Int32Array {
  const idx: number[] = [];
  const key: number[] = [];
  for (let j = 0; j < fresh.length; j += 4) {
    if (
      body[j + 3] === fresh[j + 3] &&
      (fresh[j + 3] === 0 ||
        (body[j] === fresh[j] && body[j + 1] === fresh[j + 1] && body[j + 2] === fresh[j + 2]))
    )
      continue;
    const p = j >> 2;
    idx.push(p);
    key.push(layerOf(p, L) + rand() * 2.5);
  }
  const order = idx.map((_, i) => i).sort((a, b) => key[a]! - key[b]!);
  return Int32Array.from(order, (i) => idx[i]!);
}

/** The layer (height in texels) pixel index p sits in. */
export function layerOf(p: number, L: Layout): number {
  const row = Math.floor(p / L.W);
  const col = p % L.W;
  return Math.floor(row / L.ch) * L.cols + Math.floor(col / L.cw);
}

/**
 * Copy the voxels plan[i0..i1) back from `fresh` into `body`. Returns where up to `sparks` of
 * them are in the part (art px from its middle, x forward, z up) and their colour, for sparks.
 */
export function weldSome(
  body: Uint8ClampedArray,
  fresh: Uint8ClampedArray,
  plan: Int32Array,
  i0: number,
  i1: number,
  L: Layout,
  sparks: number,
): Chip[] {
  const out: Chip[] = [];
  const n = i1 - i0;
  const every = Math.max(1, Math.floor(n / Math.max(1, sparks)));
  for (let i = i0; i < i1; i++) {
    const p = plan[i]!;
    const j = p * 4;
    body[j] = fresh[j]!;
    body[j + 1] = fresh[j + 1]!;
    body[j + 2] = fresh[j + 2]!;
    body[j + 3] = fresh[j + 3]!;
    if ((i - i0) % every || out.length >= sparks || !fresh[j + 3]) continue;
    const row = Math.floor(p / L.W);
    const col = p % L.W;
    out.push({
      x: ((col % L.cw) + 0.5 - L.cw / 2) / L.res,
      y: ((row % L.ch) + 0.5 - L.ch / 2) / L.res,
      z: layerOf(p, L) / L.res,
      s: 1 / L.res,
      rgb: (fresh[j]! << 16) | (fresh[j + 1]! << 8) | fresh[j + 2]!,
    });
  }
  return out;
}
