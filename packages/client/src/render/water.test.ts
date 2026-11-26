import { describe, expect, it } from 'vitest';
import type { MaterialManifest } from '@demodogs/shared';
import type { World } from '@demodogs/sim';
import { WATER_OUT, WATER_Q, WaterMap, deepOf } from './water';

const water = (deep?: number): MaterialManifest =>
  ({ colour: '#36b4d2', water: deep === undefined ? {} : { deep } }) as MaterialManifest;

/** The map's texel at (x, y): colour, and px in from the shore as the shader reads it. */
function texel(M: WaterMap, x: number, y: number): [number, number, number, number] {
  M.settle();
  const k = (Math.round(y / WATER_Q) * M.gw + Math.round(x / WATER_Q)) * 4;
  return [M.data[k]!, M.data[k + 1]!, M.data[k + 2]!, M.data[k + 3]! / 2 - WATER_OUT];
}

describe('the water map', () => {
  it('knows how far in from the shore a spot is, and the way to the shore from just outside', () => {
    const M = new WaterMap(400, 300);
    expect(M.any).toBe(false);
    M.pour(water(), 200, 152, 60);
    expect(M.any).toBe(true);
    expect(M.depth(200, 152)).toBeCloseTo(60, 0);
    expect(M.depth(240, 152)).toBeCloseTo(20, 0);
    expect(M.depth(268, 152)).toBeCloseTo(-8, 0);
    expect(texel(M, 240, 152)[3]).toBeCloseTo(20, 0);
    expect(texel(M, 268, 152)[3]).toBeCloseTo(-8, 0);
    // far from any water it says so
    expect(texel(M, 20, 20)[3]).toBe(-WATER_OUT);
  });

  it('makes one water of pools that touch: where two meet is not shore', () => {
    const M = new WaterMap(1200, 300);
    M.pour(water(), 160, 152, 40);
    M.settle();
    M.dirty = null;
    M.pour(water(), 220, 152, 40);
    // between the two middles it is deeper than either pool alone makes it at its edge
    expect(M.depth(192, 152)).toBeGreaterThan(8);
    // a row of small pools side by side is one stretch of water, deep along its middle: the
    // cusps between them are not shore
    for (let x = 500; x <= 700; x += 20) M.pour(water(), x, 152, 14);
    for (let x = 500; x <= 700; x += 20) M.pour(water(), x, 172, 14);
    expect(M.depth(610, 162)).toBeGreaterThan(8);
    expect(M.depth(610, 130)).toBeLessThan(0);
    // and only what is near what was poured is noted changed
    const B = M.dirty!;
    expect(B[0]).toBeGreaterThan(0);
    expect(B[2] * WATER_Q).toBeLessThan(900);
  });

  it('is darker where it is too deep to wade', () => {
    const M = new WaterMap(600, 600);
    M.pour(water(60), 300, 300, 200);
    const shallow = texel(M, 300 + 180, 300);
    const deep = texel(M, 300, 300);
    expect(shallow.slice(0, 3)).toEqual([0x36, 0xb4, 0xd2]);
    const want = deepOf([0x36, 0xb4, 0xd2]).map(Math.round);
    expect(deep.slice(0, 3)).toEqual(want);
    expect(want[0]! + want[1]! + want[2]!).toBeLessThan(0x36 + 0xb4 + 0xd2 - 120);
  });

  it('counts what stands in the water as shore, so foam gathers round its foot', () => {
    const def = water();
    const rock = { x: 200, y: 152, def: { solid: true, radius: 10 } };
    const w = {
      w: 400,
      h: 300,
      spills: [{ def, x: 200, y: 152, r: 80 }],
      statics: [rock],
      relief: null,
    } as unknown as World;
    const M = WaterMap.of(w);
    expect(M.depth(200, 152)).toBeLessThan(0);
    expect(M.depth(212, 152)).toBeLessThan(6);
    expect(M.depth(240, 152)).toBeGreaterThan(25);
    // and a world with no water has a map with none
    expect(WaterMap.of({ ...w, spills: [] } as unknown as World).any).toBe(false);
  });
});
