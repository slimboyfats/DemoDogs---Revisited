import { describe, expect, it } from 'vitest';
import { AuxBake, ELS, SKY, bakeAux, packNormal, unpackNormal, type AuxLayout } from './aux';

/** A strip's pixels from a "is this voxel solid" rule, slices laid out `cols` to a row. */
function strip(lay: AuxLayout, solid: (x: number, y: number, z: number) => boolean) {
  const W = lay.cw * lay.cols;
  const H = lay.ch * Math.ceil(lay.n / lay.cols);
  const px = new Uint8ClampedArray(W * H * 4);
  const at = (x: number, y: number, z: number) =>
    (Math.floor(z / lay.cols) * lay.ch + y) * W + (z % lay.cols) * lay.cw + x;
  for (let z = 0; z < lay.n; z++)
    for (let y = 0; y < lay.ch; y++)
      for (let x = 0; x < lay.cw; x++) if (solid(x, y, z)) px[at(x, y, z) * 4 + 3] = 255;
  return { px, W, H, at };
}

const lay: AuxLayout = { cw: 12, ch: 10, n: 8, cols: 3, res: 3 };
/** A box standing clear of the slice's edges, six texels high. */
const box = (x: number, y: number, z: number) => x >= 3 && x <= 8 && y >= 2 && y <= 7 && z < 6;

describe('packNormal', () => {
  it('keeps a facing to within its steps, and calls anything facing down a wall', () => {
    for (const n of [
      [1, 0, 0],
      [0, -1, 0],
      [-0.6, 0.6, 0.5],
      [0, 0, 1],
    ] as const) {
      const len = Math.hypot(...n);
      const u = unpackNormal(packNormal(n[0], n[1], n[2]))!;
      expect(u[0] * n[0] + u[1] * n[1] + u[2] * n[2]).toBeGreaterThan(0.97 * len);
    }
    expect(unpackNormal(packNormal(1, 0, -1))![2]).toBe(0);
    expect(packNormal(0, 0, 1)).toBe(ELS);
    expect(unpackNormal(0)).toBeNull();
  });
});

describe('bakeAux', () => {
  const { px, W, H, at } = strip(lay, box);
  const out = bakeAux(px, W, H, lay);
  const normal = (x: number, y: number, z: number) => unpackNormal(out[at(x, y, z) * 2]!);

  it('faces a wall outwards and a top up', () => {
    expect(normal(3, 5, 2)![0]).toBeLessThan(-0.9);
    expect(normal(8, 5, 2)![0]).toBeGreaterThan(0.9);
    expect(normal(5, 2, 2)![1]).toBeLessThan(-0.9);
    expect(normal(5, 7, 2)![1]).toBeGreaterThan(0.9);
    expect(normal(5, 5, 5)![2]).toBeGreaterThan(0.9);
    // the foot of a wall still faces out, not down into the ground
    expect(normal(3, 5, 0)![0]).toBeLessThan(-0.8);
  });

  it('leaves what is inside or empty unknown', () => {
    expect(out[at(5, 5, 2) * 2]).toBe(0);
    expect(out[at(0, 0, 0) * 2]).toBe(0);
    expect(out[at(0, 0, 0) * 2 + 1]).toBe(0);
  });

  it('marks only the top of each column as open to the sky', () => {
    expect(out[at(5, 5, 5) * 2 + 1]! & SKY).toBe(SKY);
    expect(out[at(5, 5, 4) * 2 + 1]! & SKY).toBe(0);
    expect(out[at(3, 5, 5) * 2 + 1]! & SKY).toBe(SKY);
  });

  it('carries the glow of lamp texels', () => {
    const glow = new Uint8Array(W * H);
    glow[at(8, 5, 2)] = 7;
    const lit = bakeAux(px, W, H, lay, glow);
    expect(lit[at(8, 5, 2) * 2 + 1]! & 7).toBe(7);
    expect(lit[at(3, 5, 2) * 2 + 1]! & 7).toBe(0);
  });

  it('gives the same bytes baked a slice at a time', () => {
    const b = new AuxBake(px, W, H, lay);
    let steps = 0;
    while (!b.step(() => true)) steps++;
    expect(steps).toBe(lay.n - 1);
    expect([...b.out]).toEqual([...out]);
  });
});
