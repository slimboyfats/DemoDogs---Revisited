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

  it('a leaf brakes, flutters down and is handed over where it lands', () => {
    const C = new Cells(8, rng());
    C.add(CKind.Leaf, 0, 0, 10, 200, 0, 20, 9, 0x3f8a3f);
    let ticks = 0;
    while (C.n && ticks < 600) {
      C.step(1 / 60);
      ticks++;
    }
    // it did not fly off at 200 px a second, and it took its time coming down
    expect(C.n).toBe(0);
    expect(ticks).toBeGreaterThan(40);
    expect(C.landed.length).toBe(3);
    const far = Math.abs(C.landed[0]!);
    expect(far).toBeGreaterThan(5);
    expect(far).toBeLessThan(160);
    const seen: number[] = [];
    C.add(CKind.Leaf, 0, 0, 10, 0, 0, 0, 9, 0x3f8a3f);
    for (let i = 0; i < 30; i++) {
      C.step(1 / 60);
      C.draw(
        (_x, _y, _z, _s, rgb) => seen.push(rgb),
        () => {},
        () => true,
      );
    }
    // tumbling shows two faces
    expect(new Set(seen).size).toBe(2);
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

  it('a whirlpool carries cells round and in, and leaves those beyond it alone', () => {
    const C = new Cells(8, rng());
    C.add(CKind.Wisp, 40, 0, 2, 0, 0, 0, 9);
    C.add(CKind.Wisp, 200, 0, 2, 0, 0, 0, 9);
    const at = (i: number) => (C as unknown as { x: Float32Array; y: Float32Array }).x[i]!;
    const yat = (i: number) => (C as unknown as { y: Float32Array }).y[i]!;
    for (let i = 0; i < 30; i++) C.swirl(0, 0, 70, 60, 1 / 60);
    expect(Math.hypot(at(0), yat(0))).toBeLessThan(40);
    expect(yat(0)).not.toBe(0);
    expect(at(1)).toBe(200);
  });

  it('gas lets go `split` finer cells at once, leaves stay one', () => {
    const C = new Cells(64, rng());
    C.split = 4;
    C.add(CKind.Fire, 0, 0, 1, 0, 0, 0, 1);
    expect(C.n).toBe(4);
    C.add(CKind.Leaf, 0, 0, 10, 0, 0, 0, 5, 0x3f8a3f);
    expect(C.n).toBe(5);
  });

  it('a fast car drags smoke along behind it and stirs it into a wake', () => {
    const run = (car: boolean) => {
      const C = new Cells(64, rng());
      // smoke hanging over the road, a little behind and beside where the car is
      for (let k = 0; k < 6; k++) C.add(CKind.Wisp, -6, (k - 3) * 2, 2, 0, 0, 0, 3, 0x808080);
      for (let t = 0; t < 30; t++) {
        C.movers.length = 0;
        if (car) C.movers.push(t * 4, 0, 0, 240, 0);
        C.step(1 / 60);
      }
      // the mean drift along the car's way and the spread across it
      let ax = 0;
      let ys = 0;
      const seen: number[] = [];
      C.draw(
        (x, y) => seen.push(x, y),
        () => {},
        () => true,
      );
      for (let i = 0; i < seen.length; i += 2) {
        ax += seen[i]!;
        ys += Math.abs(seen[i + 1]!);
      }
      return { ax: ax / (seen.length / 2), ys: ys / (seen.length / 2) };
    };
    const calm = run(false);
    const stirred = run(true);
    expect(stirred.ax - calm.ax).toBeGreaterThan(8);
    expect(stirred.ys).not.toBe(calm.ys);
    // behind a back corner the air turns: across the car's way, opposite on the two sides
    const C = new Cells(1, rng());
    C.movers.push(0, 0, 0, 200, 0);
    const l: [number, number, number] = [0, 0, 0];
    const r: [number, number, number] = [0, 0, 0];
    C.stir(-30, -14, 1, l);
    C.stir(-30, 14, 1, r);
    expect(Math.abs(l[1])).toBeGreaterThan(5);
    expect(Math.sign(l[1])).toBe(-Math.sign(r[1]));
  });

  it('a slow car leaves the air alone', () => {
    const C = new Cells(8, rng());
    const out: [number, number, number] = [0, 0, 0];
    C.movers.push(0, 0, 0, 10, 0);
    C.stir(-3, 0, 1, out);
    expect(out).toEqual([0, 0, 0]);
    const D = new Cells(8, rng());
    D.movers.push(0, 0, 0, 200, 0);
    D.stir(-3, 0, 1, out);
    expect(out[0]).toBeGreaterThan(20);
  });
});
