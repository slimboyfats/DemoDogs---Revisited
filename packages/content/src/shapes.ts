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
