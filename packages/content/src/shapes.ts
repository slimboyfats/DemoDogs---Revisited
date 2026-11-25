/** Small helpers for writing look shape functions. Pure; no state. */

/** Inside a rounded rectangle of half extents a, b and corner radius r? */
export function rr(x: number, y: number, a: number, b: number, r: number): boolean {
  const dx = Math.max(Math.abs(x) - (a - r), 0);
  const dy = Math.max(Math.abs(y) - (b - r), 0);
  return Math.abs(x) <= a && Math.abs(y) <= b && dx * dx + dy * dy <= r * r;
}

export function disc(x: number, y: number, r: number): boolean {
  return x * x + y * y <= r * r;
}

/** A stable hash of three integers to [0, 1), for texture noise in looks. */
export function hash3(x: number, y: number, z: number): number {
  let n = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** Car bodies are all 26 x 14 cells, 9 layers; layer 0 is the undertray. */
export const CAR_CELL = { w: 26, h: 14, layers: 9 } as const;

/** Smooth noise in [0, 1): hash3 at the whole points around (x, y, z), blended between them. */
export function noise3(x: number, y: number, z: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const s = (t: number) => t * t * (3 - 2 * t);
  const fx = s(x - x0);
  const fy = s(y - y0);
  const fz = s(z - z0);
  let out = 0;
  for (let k = 0; k < 8; k++) {
    const dx = k & 1;
    const dy = (k >> 1) & 1;
    const dz = k >> 2;
    out +=
      hash3(x0 + dx, y0 + dy, z0 + dz) *
      (dx ? fx : 1 - fx) *
      (dy ? fy : 1 - fy) *
      (dz ? fz : 1 - fz);
  }
  return out;
}

/** A puff of a crown: where its middle is (x, y, z) and how big round it is. */
export type Puff = readonly [number, number, number, number];

/**
 * How deep inside a crown of round puffs a point is (below 0: outside). `squash` over 1 makes
 * the puffs flatter. Clean round shapes with nothing ragged: the plain, bold scenery is built of these.
 */
export function puffs(x: number, y: number, z: number, of: readonly Puff[], squash = 1): number {
  let inside = -9;
  for (const [cx, cy, cz, cr] of of)
    inside = Math.max(inside, cr - Math.hypot(x - cx, y - cy, (z - cz) * squash));
  return inside;
}

/**
 * Which of three tones a point of a round crown takes, 0 (in shade) to 2 (lit): by how high it is
 * between `low` and `high`, and leaning to the light at the top left, in plain bands.
 */
export function band(x: number, y: number, z: number, low: number, high: number): 0 | 1 | 2 {
  const t = (z - low) / (high - low) - (x + y) * 0.035;
  return t > 0.62 ? 2 : t > 0.3 ? 1 : 0;
}
