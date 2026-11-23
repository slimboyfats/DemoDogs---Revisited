import { describe, expect, it } from 'vitest';
import type { StaticProp, World } from '@demodogs/sim';
import type { Strip } from './stack';
import type { StackSink } from './stacks';
import { Builder, SliceFx, buildSlice, buildTime } from './slice-fx';

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
