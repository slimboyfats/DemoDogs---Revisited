import { describe, expect, it } from 'vitest';
import { allVoxels, dentVoxels, hexRgb, shatterVoxels, toneOf, tones, type Voxels } from './strips';

describe('strip shading', () => {
  it('tops are lighter than sides, sides lighter than shade', () => {
    const [shade, side, top] = tones('#808080').map((t) => hexRgb(t)[0]);
    expect(shade).toBeLessThan(side!);
    expect(side).toBeLessThan(top!);
  });

  it('a voxel with nothing above is a top; low covered voxels are in shade', () => {
    expect(toneOf(false, 0, 9)).toBe(2);
    expect(toneOf(true, 0, 9)).toBe(0);
    expect(toneOf(true, 5, 9)).toBe(1);
  });
});

/** A solid block of red voxels, cw by ch by n. */
function block(cw: number, ch: number, n: number): Voxels {
  const W = cw * n;
  const px = new Uint8ClampedArray(W * ch * 4);
  for (let i = 0; i < px.length; i += 4) {
    px[i] = 200;
    px[i + 3] = 255;
  }
  return { px, W, cw, ch, n };
}
const half = () => 0.5;

describe('breaking voxels off', () => {
  it('a dent knocks off top voxels near the hit, keeps the floor, and returns what came off', () => {
    const v = block(12, 8, 6);
    const before = allVoxels(v).length;
    const chips = dentVoxels(v, 0, 0, 4, 0.5, () => 1);
    expect(chips.length).toBeGreaterThan(0);
    expect(allVoxels(v).length).toBe(before - chips.length);
    // only the top three layers are crushed, and only near the middle
    for (const c of chips) {
      expect(c.z).toBeGreaterThanOrEqual(3);
      expect(Math.hypot(c.x, c.y)).toBeLessThan(4 * 0.55 + 0.01);
      expect(c.rgb).toBe(0xc80000);
    }
    expect(allVoxels(v).filter((c) => c.z === 0)).toHaveLength(12 * 8);
  });

  it('a dent scuffs the paint it leaves behind', () => {
    const v = block(12, 8, 6);
    dentVoxels(v, 0, 0, 4, 0.1, () => 1);
    const mid = allVoxels(v).find((c) => c.z === 0 && Math.abs(c.x) < 1 && Math.abs(c.y) < 1)!;
    expect(mid.rgb >> 16).toBeLessThan(200);
  });

  it('shattering takes voxels from every layer above the floor', () => {
    const v = block(10, 6, 5);
    const chips = shatterVoxels(v, 2, half);
    expect(chips).toHaveLength(10 * 6 * 4);
    expect(allVoxels(v).every((c) => c.z === 0)).toBe(true);
    expect(shatterVoxels(block(10, 6, 5), 0, half)).toHaveLength(0);
  });
});
