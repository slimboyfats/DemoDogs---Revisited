import { describe, expect, it } from 'vitest';
import {
  allVoxels,
  at,
  dentVoxels,
  detachNear,
  detachVoxels,
  hexRgb,
  lightOf,
  shatterVoxels,
  tones,
  type Voxels,
} from './strips';

describe('strip shading', () => {
  it('tops are lighter than sides, sides lighter than shade', () => {
    const [shade, side, top] = tones('#808080').map((t) => hexRgb(t)[0]);
    expect(shade).toBeLessThan(side!);
    expect(side).toBeLessThan(top!);
  });

  it('a flat open top is brightest, the foot of a wall darkest, in a few hard steps', () => {
    expect(lightOf(1, 1, 1)).toBe(1);
    expect(lightOf(0, 0, 0)).toBeLessThan(0.2);
    // a slope is darker than a flat top, a wall darker still, and a shaded top darker than an open one
    expect(lightOf(0.7, 1, 0.5)).toBeLessThan(lightOf(1, 1, 0.5));
    expect(lightOf(0, 1, 0.5)).toBeLessThan(lightOf(0.7, 1, 0.5));
    expect(lightOf(1, 0.3, 0.5)).toBeLessThan(lightOf(1, 1, 0.5));
    expect(lightOf(0, 1, 1)).toBeGreaterThan(lightOf(0, 1, 0));
    const steps = new Set<number>();
    for (let f = 0; f <= 1; f += 0.01) steps.add(lightOf(f, 1, 0.5));
    expect(steps.size).toBeLessThanOrEqual(8);
  });
});

/** A solid block of red voxels, cw by ch by n texels, `res` to the art px, wrapped over rows. */
function block(cw: number, ch: number, n: number, res = 1, cols = n): Voxels {
  const W = cw * cols;
  const px = new Uint8ClampedArray(W * ch * Math.ceil(n / cols) * 4);
  const v: Voxels = { px, W, cw, ch, n, res, cols };
  for (let z = 0; z < n; z++)
    for (let y = 0; y < ch; y++)
      for (let x = 0; x < cw; x++) {
        const j = at(v, x, y, z);
        px[j] = 200;
        px[j + 3] = 255;
      }
  return v;
}
const count = (v: Voxels) => allVoxels(v).length;
const half = () => 0.5;

describe('breaking voxels off', () => {
  it('a strip wrapped over rows holds every voxel once', () => {
    expect(count(block(5, 4, 7, 1, 3))).toBe(5 * 4 * 7);
    const v = block(5, 4, 7, 1, 3);
    v.px[at(v, 2, 1, 5) + 3] = 0;
    expect(count(v)).toBe(5 * 4 * 7 - 1);
  });

  it('a dent craters the top near the hit and keeps the floor', () => {
    const v = block(12, 8, 6);
    const before = count(v);
    const chips = dentVoxels(v, 0, 0, 4, 0.5, () => 1);
    expect(chips.length).toBeGreaterThan(0);
    expect(count(v)).toBeLessThan(before);
    for (const c of chips) {
      expect(c.z).toBeGreaterThanOrEqual(3);
      expect(Math.hypot(c.x, c.y)).toBeLessThan(4 * 0.6 + 0.01);
      expect(c.rgb).toBe(0xc80000);
    }
    expect(allVoxels(v).filter((c) => c.z === 0)).toHaveLength(12 * 8);
  });

  it('a hit on one side leaves the other side whole', () => {
    const v = block(24, 12, 6, 3);
    dentVoxels(v, 0, -2, 1.2, 1, () => 1);
    const left = allVoxels(v).filter((c) => c.y < 0).length;
    const right = allVoxels(v).filter((c) => c.y > 0).length;
    expect(left).toBeLessThan(right);
    expect(right).toBe((24 * 12 * 6) / 2);
  });

  it('what comes off is gathered into blocks, as big as what each lost', () => {
    const v = block(12, 12, 6, 3);
    const fine = dentVoxels(block(12, 12, 6, 3), 0, 0, 1.5, 1, () => 1, 1, 1);
    const coarse = dentVoxels(v, 0, 0, 1.5, 1, () => 1, 1, 3);
    expect(coarse.length).toBeLessThan(fine.length / 4);
    expect(fine.every((c) => Math.abs(c.s - 1 / 3) < 1e-9)).toBe(true);
    expect(Math.max(...coarse.map((c) => c.s))).toBeGreaterThan(0.6);
    expect(Math.max(...coarse.map((c) => c.s))).toBeLessThanOrEqual(1);
    // the same amount of stuff either way
    const vol = (cs: { s: number }[]) => cs.reduce((a, c) => a + c.s ** 3, 0);
    expect(vol(coarse)).toBeCloseTo(vol(fine));
  });

  it('a dent scuffs the rim and bares the floor of the hole', () => {
    const v = block(12, 8, 6);
    dentVoxels(v, 0, 0, 4, 0.4, () => 1);
    const all = allVoxels(v);
    // on the rim nothing is removed, and the top is darker than it was
    const rim = all.find((c) => c.z === 5 && Math.abs(c.x - 3) < 1 && Math.abs(c.y) < 1)!;
    expect(rim.rgb >> 16).toBeLessThan(200);
    // in the middle the top is gone, and what is now on show is lighter than buried paint
    const mid = all.filter((c) => Math.abs(c.x) < 1 && Math.abs(c.y) < 1);
    const top = Math.max(...mid.map((c) => c.z));
    expect(top).toBeLessThan(5);
    expect(mid.find((c) => c.z === top)!.rgb >> 16).toBeGreaterThan(200);
  });

  it('a crater is measured from the surface, so a low part loses as much as a tall one', () => {
    const tall = block(12, 8, 12);
    const low = block(12, 8, 12);
    // the low part is the same block with its top half missing
    for (let z = 6; z < 12; z++)
      for (let y = 0; y < 8; y++) for (let x = 0; x < 12; x++) low.px[at(low, x, y, z) + 3] = 0;
    const a = count(tall);
    const b = count(low);
    dentVoxels(tall, 0, 0, 4, 0.2, () => 1);
    dentVoxels(low, 0, 0, 4, 0.2, () => 1);
    expect(b - count(low)).toBe(a - count(tall));
    expect(b - count(low)).toBeGreaterThan(0);
  });

  it('shattering takes whole blocks from above the floor', () => {
    const v = block(10, 6, 5);
    const chips = shatterVoxels(v, 2, half, 1, 2);
    expect(chips.reduce((a, c) => a + Math.round(c.s ** 3), 0)).toBe(10 * 6 * 4);
    expect(allVoxels(v).every((c) => c.z === 0)).toBe(true);
    expect(shatterVoxels(block(10, 6, 5), 0, half)).toHaveLength(0);
  });

  it('what is cut off from the floor comes away, what still hangs on stays', () => {
    const v = block(9, 3, 6);
    // saw through the block above the floor at x = 4, then cut the right half off its floor
    for (let z = 1; z < 6; z++) for (let y = 0; y < 3; y++) v.px[at(v, 4, y, z) + 3] = 0;
    expect(detachVoxels(v)).toHaveLength(0);
    for (let y = 0; y < 3; y++) for (let x = 5; x < 9; x++) v.px[at(v, x, y, 1) + 3] = 0;
    const loose = detachVoxels(v, 1, 1);
    expect(loose).toHaveLength(4 * 3 * 4);
    expect(loose.every((c) => c.x > 0 && c.z >= 2)).toBe(true);
    expect(count(v)).toBe(9 * 3 + 4 * 3 * 5);
    expect(detachVoxels(v)).toHaveLength(0);
  });
});

describe('breaking off near a blow', () => {
  it('takes only the piece the blow cut loose, and leaves the body', () => {
    const v = block(12, 6, 10, 2);
    // saw a slab off the top at one end: cut through layer 6 for x < 5, and down the side at x = 5
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < 5; x++) v.px[at(v, x, y, 6) + 3] = 0;
      for (let z = 6; z < 10; z++) v.px[at(v, 5, y, z) + 3] = 0;
    }
    const before = count(v);
    const loose = detachNear(v, 0, 0, 6, 5, 1, 1);
    expect(loose.length).toBe(5 * 6 * 3);
    expect(count(v)).toBe(before - 5 * 6 * 3);
    // nothing else is loose
    expect(detachVoxels(v, 1).length).toBe(0);
  });

  it('a piece too big to be debris stays', () => {
    const v = block(12, 6, 10, 2);
    for (let y = 0; y < 6; y++) for (let x = 0; x < 12; x++) v.px[at(v, x, y, 4) + 3] = 0;
    expect(detachNear(v, 0, 0, 11, 5, 1, 1, 50).length).toBe(0);
    expect(detachNear(v, 0, 0, 11, 5, 1, 1).length).toBe(12 * 6 * 5);
  });
});
