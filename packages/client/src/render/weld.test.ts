import { describe, expect, it } from 'vitest';
import { layerOf, weldPlan, weldSome, type Layout } from './weld';

// two layers of 2x2 side by side: W 4, slices 2x2, 2 to a row
const L: Layout = { W: 4, cw: 2, ch: 2, cols: 2, res: 1 };
const solid = () => {
  const px = new Uint8ClampedArray(4 * 2 * 4);
  for (let j = 0; j < px.length; j += 4) px.set([200, 100, 50, 255], j);
  return px;
};

describe('the field welder, drawn', () => {
  it('finds the layer of a pixel', () => {
    expect(layerOf(0, L)).toBe(0);
    expect(layerOf(3, L)).toBe(1);
    expect(layerOf(5, L)).toBe(0);
  });

  it('plans every lost or scuffed voxel, bottom layer first, and welds them back', () => {
    const fresh = solid();
    const body = fresh.slice();
    body[3 * 4 + 3] = 0; // knocked off, layer 1
    body[4 * 4] = 10; // scuffed, layer 0
    body[1 * 4 + 3] = 0; // knocked off, layer 0
    const plan = weldPlan(body, fresh, L, () => 0);
    expect([...plan]).toEqual([1, 4, 3]);
    const beads = weldSome(body, fresh, plan, 0, 3, L, 3);
    expect(body).toEqual(fresh);
    expect(beads).toHaveLength(3);
    expect(beads[2]).toMatchObject({ z: 1, rgb: 0xc86432 });
    expect(weldPlan(body, fresh, L, () => 0)).toHaveLength(0);
  });

  it('a voxel that should be empty is cleared, and sparks are capped', () => {
    const fresh = solid();
    fresh[3] = 0;
    const body = solid();
    body[7] = 0;
    body[11] = 0;
    const plan = weldPlan(body, fresh, L, () => 0);
    expect(plan).toHaveLength(3);
    expect(weldSome(body, fresh, plan, 0, plan.length, L, 1).length).toBeLessThanOrEqual(1);
    expect(body).toEqual(fresh);
  });
});
