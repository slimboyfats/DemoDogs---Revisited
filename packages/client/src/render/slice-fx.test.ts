import { describe, expect, it } from 'vitest';
import type { Car, StaticProp, World } from '@demodogs/sim';
import type { Strip } from './stack';
import type { StackSink } from './stacks';
import { Builder, SliceFx, THIN, buildSlice, buildTime, footprint, hidesFrom } from './slice-fx';

describe('building slice by slice', () => {
  it('starts with nothing, the lowest slice first, and ends with everything in place', () => {
    expect(buildSlice(0, 0)).toBeNull();
    expect(buildSlice(0, 0.05)).not.toBeNull();
    expect(buildSlice(10, 0.05)).toBeNull();
    const done = buildTime(10);
    expect(buildSlice(10, done)).toEqual({ dz: 0, turn: 0 });
    expect(buildSlice(0, done)).toEqual({ dz: 0, turn: 0 });
  });

  it('a slice comes down from above, turning less as it settles', () => {
    const a = buildSlice(0, 0.05)!;
    const b = buildSlice(0, 0.2)!;
    expect(a.dz).toBeGreaterThan(b.dz);
    expect(a.turn).toBeGreaterThan(b.turn);
    expect(b.dz).toBeGreaterThan(0);
  });

  it('the builder passes slices on where the build has them, and leaves out what has not started', () => {
    const got: number[][] = [];
    const R = {
      visible: () => true,
      group: () => {},
      slice: (_s: Strip, i: number, _x: number, _y: number, z: number, rot: number) =>
        got.push([i, z, rot]),
      stack: () => {},
      zoom: () => {},
      limb: () => {},
    } as unknown as StackSink;
    const strip = { n: 20, res: 1, cw: 8, ch: 8 } as Strip;
    new Builder().into(R, { t0: 0, base: 5 }, 0.3).stack(strip, 0, 0, 5, 0);
    expect(got.length).toBeGreaterThan(1);
    expect(got.length).toBeLessThan(20);
    // the bottom slice has landed; the highest one passed on is still up in the air and turned
    expect(got[0]).toEqual([0, 5, 0]);
    const top = got[got.length - 1]!;
    expect(top[1]).toBeGreaterThan(5 + top[0]!);
    expect(top[2]).toBeGreaterThan(0);
    // once the build is over every slice is where it belongs
    got.length = 0;
    new Builder().into(R, { t0: 0, base: 5 }, buildTime(20)).stack(strip, 0, 0, 5, 0);
    expect(got.map((g) => g[1])).toEqual(Array.from({ length: 20 }, (_, i) => 5 + i));
  });
});

describe('seeing through tall scenery', () => {
  // a tower 20 wide, 20 deep, 60 tall at (100, 100)
  const from = (cx: number, cy: number, cz = 0, height = 60): number =>
    hidesFrom(100, 100, 10, 10, height, cx, cy, cz);

  it('leaves alone what hides nothing', () => {
    expect(from(100, 130)).toBe(60); // the car is in front
    expect(from(140, 80)).toBe(60); // off to one side
    expect(from(100, 20)).toBe(60); // far behind, clear of the top
    expect(from(100, 80, 0, 10)).toBe(10); // too low to hide a car
    expect(from(100, 80, 70)).toBe(60); // the car is above it
  });

  it('starts just above what does not hide the car, and never below waist height', () => {
    const near = from(100, 85);
    const far = from(100, 65);
    expect(near).toBeLessThan(60);
    expect(near).toBeGreaterThanOrEqual(7);
    expect(far).toBeGreaterThan(near);
    expect(far).toBeLessThan(60);
  });

  it('measures a turned footprint', () => {
    const s = { cw: 40, ch: 10, res: 1 } as Strip;
    expect(footprint(s, 0)).toEqual([20, 5]);
    const [w, d] = footprint(s, Math.PI / 2);
    expect(w).toBeCloseTo(5);
    expect(d).toBeCloseTo(20);
  });

  it('thins out while the car is behind and fills in again when it has gone', () => {
    const fx = new SliceFx();
    const w = { statics: [], props: [], pickups: [] } as unknown as World;
    const strip = { n: 60, res: 1, cw: 20, ch: 20 } as Strip;
    const tower = { x: 100, y: 100, rot: 0 } as StaticProp;
    const car = (x: number, y: number): Car => ({ x, y, z: 0 }) as Car;
    fx.frame(w, 0);
    // the first frame it is still whole
    expect(fx.through(tower, strip, 60, car(100, 85))).toBeNull();
    let last = 1;
    for (let i = 0; i < 30; i++) {
      fx.frame(w, 1 / 60);
      const t = fx.through(tower, strip, 60, car(100, 85))!;
      expect(t.alpha).toBeLessThanOrEqual(last);
      expect(t.from).toBeGreaterThanOrEqual(7);
      expect(t.from).toBeLessThan(60);
      last = t.alpha;
    }
    expect(last).toBeCloseTo(THIN);
    for (let i = 0; i < 30; i++) {
      fx.frame(w, 1 / 60);
      const t = fx.through(tower, strip, 60, car(100, 200));
      if (t) expect(t.alpha).toBeGreaterThanOrEqual(last);
      last = t?.alpha ?? 1;
    }
    expect(last).toBe(1);
    expect(fx.busy).toBe(0);
    // nobody to watch, or switched off: whole
    expect(fx.through(tower, strip, 60, null)).toBeNull();
    fx.on = false;
    expect(fx.through(tower, strip, 60, car(100, 85))).toBeNull();
  });
});

describe('SliceFx', () => {
  const world = (): World =>
    ({ statics: [], props: [], pickups: [{ on: true }, { on: false }] }) as unknown as World;

  it('builds what is put down after the start and pickups that come back, not what was there', () => {
    const fx = new SliceFx();
    const w = world();
    w.statics.push({} as StaticProp);
    fx.frame(w, 0.016);
    expect(fx.busy).toBe(0);
    const s = {} as StaticProp;
    w.statics.push(s);
    w.pickups[1]!.on = true;
    fx.frame(w, 0.016);
    expect(fx.building(s, 20)).not.toBeNull();
    expect(fx.building(w.pickups[1]!, 8)).not.toBeNull();
    expect(fx.building(w.pickups[0]!, 8)).toBeNull();
    // and it ends
    fx.frame(w, buildTime(20));
    expect(fx.building(s, 20)).toBeNull();
    // the pickup's build was never asked after again: dropped once it is stale
    fx.frame(w, 6);
    expect(fx.busy).toBe(0);
  });

  it('does nothing when switched off', () => {
    const fx = new SliceFx();
    fx.on = false;
    fx.start({});
    expect(fx.busy).toBe(0);
  });
});
