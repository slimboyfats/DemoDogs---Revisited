import { describe, expect, it } from 'vitest';
import { BANG_RAMP, CKind, Cells, FIRE_RAMP } from './cells';

const rng = () => {
  let s = 7;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
};
const lum = (c: number) => ((c >> 16) & 255) + ((c >> 8) & 255) + (c & 255);

describe('cells', () => {
  it('fire burns white, down the ramp to soot, then pales as smoke', () => {
    expect(lum(BANG_RAMP[0]!)).toBeGreaterThan(lum(BANG_RAMP[8]!));
    expect(lum(FIRE_RAMP[0]!)).toBeGreaterThan(lum(FIRE_RAMP[3]!));
    expect(lum(FIRE_RAMP[12]!)).toBeGreaterThan(lum(FIRE_RAMP[4]!));
  });

  it('a cell burns out at the end of its life, and a full engine replaces old cells', () => {
    const C = new Cells(8, rng());
    for (let i = 0; i < 12; i++) C.add(CKind.Bang, 0, 0, 1, 10, 0, 0, 0.5);
    expect(C.n).toBe(8);
    for (let i = 0; i < 40; i++) C.step(1 / 60);
    expect(C.n).toBe(0);
  });

  it('a ring of air lifts what is in its middle and rolls it out over the top', () => {
    const C = new Cells(8, rng());
    C.ring({ x: 0, y: 0, z: 10, vz: 0, R: 10, r: 6, spin: 50, grow: 0, life: 2 });
    const air: [number, number, number] = [0, 0, 0];
    C.air(2, 0, 10, air);
    expect(air[2]).toBeGreaterThan(5);
    C.air(10, 0, 16, air);
    expect(air[0]).toBeGreaterThan(5);
    C.air(18, 0, 10, air);
    expect(air[2]).toBeLessThan(-5);
    C.air(200, 0, 10, air);
    expect(air[2]).toBe(0);
  });

  it('smoke is carried up by the air and never goes under the ground', () => {
    const C = new Cells(64, rng());
    C.ring({ x: 0, y: 0, z: 6, vz: 20, R: 8, r: 6, spin: 40, grow: 2, life: 2 });
    for (let i = 0; i < 40; i++) C.add(CKind.Wisp, 0, 0, 1, 0, 0, -30, 3, 0x505050);
    const seen: number[] = [];
    for (let i = 0; i < 60; i++) C.step(1 / 60);
    C.draw(
      (_x, _y, z) => seen.push(z),
      () => {},
      () => true,
    );
    expect(seen.length).toBeGreaterThan(10);
    expect(Math.min(...seen)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...seen)).toBeGreaterThan(8);
    expect(C.count(CKind.Wisp)).toBe(40);
  });
});
