import { describe, expect, it } from 'vitest';
import {
  CRUMB,
  launch,
  sample,
  shards,
  stepVoxel,
  stepHoming,
  front,
  landing,
  type Homing,
  launchTogether,
  type Burst,
  type Voxel,
} from './voxels';

const mid = () => 0.5;
const burst: Burst = { x: 100, y: 50, h: 0, z: 1, ox: 100, oy: 50, speed: 80, vx: 0, vy: 0 };

describe('loose voxels', () => {
  it('fly away from the blast point', () => {
    const v = launch({ x: 4, y: 0, z: 3, rgb: 0x112233, s: 1 }, burst, mid);
    expect(v.x).toBe(104);
    expect(v.z).toBe(4);
    expect(v.vx).toBeGreaterThan(0);
    expect(v.vz).toBeGreaterThan(0);
    expect(v.rgb).toBe(0x112233);
    const back = launch({ x: -4, y: 0, z: 0, rgb: 0, s: 1 }, burst, mid);
    expect(back.vx).toBeLessThan(0);
  });

  it('turn with the thing they came off', () => {
    const v = launch({ x: 4, y: 0, z: 0, rgb: 0, s: 1 }, { ...burst, h: Math.PI / 2 }, mid);
    expect(v.x).toBeCloseTo(100);
    expect(v.y).toBeCloseTo(54);
  });

  it('fall, bounce and come to rest on the ground', () => {
    const v: Voxel = launch({ x: 2, y: 1, z: 5, rgb: 0, s: 1 }, burst, mid);
    let ticks = 0;
    let top = 0;
    while (stepVoxel(v, 1 / 60) !== 'rest' && ticks < 1000) {
      top = Math.max(top, v.z);
      ticks++;
    }
    expect(top).toBeGreaterThan(6);
    expect(v.z).toBe(0);
    expect(ticks).toBeLessThan(60 * 6);
  });

  it('are laid to rest after a while even if they never stop', () => {
    const v: Voxel = {
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      rot: 0,
      spin: 0,
      rgb: 0,
      s: 1,
      age: 5.99,
    };
    v.vx = 1000;
    v.z = 900;
    expect(stepVoxel(v, 1 / 60)).toBe('rest');
  });

  it('a block that lands hard breaks into 2, 4 or 8 of half its size, down to a crumb', () => {
    const fall = (vz: number, size: number): Voxel => ({
      x: 5,
      y: 5,
      z: 0.1,
      vx: 10,
      vy: 0,
      vz,
      rot: 0,
      spin: 0,
      rgb: 0x808080,
      s: size,
      age: 0,
    });
    const hard = fall(-400, 2);
    expect(stepVoxel(hard, 1 / 60)).toBe('split');
    const bits = shards(hard, mid);
    expect(bits).toHaveLength(8);
    expect(bits.every((b) => b.s === 1 && b.vz > 0)).toBe(true);
    const soft = fall(-100, 2);
    expect(stepVoxel(soft, 1 / 60)).toBe('split');
    expect(shards(soft, mid)).toHaveLength(2);
    expect(stepVoxel(fall(-20, 2), 1 / 60)).not.toBe('split');
    // a crumb is as small as it gets
    expect(stepVoxel(fall(-400, CRUMB), 1 / 60)).not.toBe('split');
    const small = fall(-400, CRUMB * 1.5);
    stepVoxel(small, 1 / 60);
    expect(shards(small, mid).every((b) => b.s === CRUMB)).toBe(true);
  });

  it('chips thrown together leave the same way', () => {
    const [a, b] = launchTogether(
      [
        { x: 4, y: 0, z: 3, rgb: 0, s: 1 },
        { x: -4, y: 2, z: 1, rgb: 0, s: 1 },
      ],
      burst,
      Math.random,
    );
    expect([b!.vx, b!.vy, b!.vz]).toEqual([a!.vx, a!.vy, a!.vz]);
    expect(b!.x).not.toBe(a!.x);
  });

  it('sample keeps at most max items', () => {
    expect(sample([1, 2, 3, 4, 5], 3, mid)).toHaveLength(3);
    expect(sample([1, 2], 5, mid).sort()).toEqual([1, 2]);
  });
});

describe('stepHoming', () => {
  it('lifts a block off the ground and lands it exactly where it belongs, on time', () => {
    const h: Homing = {
      ...{ x0: 0, y0: 0, z0: 0, x1: 10, y1: 5, z1: 20, x: 0, y: 0, z: 0 },
      ...{ rot: 1, rgb: 0, s: 1, t: 0, wait: 0.4, dur: 1.6 },
    };
    let done = false;
    let top = 0;
    for (let i = 0; i < 100 && !done; i++) {
      done = stepHoming(h, 1 / 60);
      top = Math.max(top, h.z);
    }
    expect(done).toBe(true);
    expect([h.x, h.y, h.z]).toEqual([10, 5, 20]);
    expect(top).toBeGreaterThan(20);
  });
});

describe('a rebuild', () => {
  it('lands what is further left and lower first, and everything by the end', () => {
    expect(front(0, 0)).toBe(0);
    expect(front(1, 1)).toBe(1);
    expect(front(0.2, 0.5)).toBeLessThan(front(0.8, 0.5));
    expect(front(0.5, 0.1)).toBeLessThan(front(0.5, 0.9));
    // across counts for more than up
    expect(front(1, 0)).toBeGreaterThan(front(0, 1));
    for (const f of [0, 0.3, 0.7, 1]) {
      const [off, land] = landing(f, 2.4);
      expect(off).toBeLessThan(land);
      expect(land).toBeLessThanOrEqual(2.4 + 1e-9);
    }
    expect(landing(1, 2.4)[1]).toBeCloseTo(2.4, 6);
  });

  it('a block on rubble stops on top of it', () => {
    const v: Voxel = {
      x: 0,
      y: 0,
      z: 9,
      vx: 0,
      vy: 0,
      vz: -10,
      rot: 0,
      spin: 0,
      rgb: 0,
      s: 1,
      age: 0,
    };
    let fate = stepVoxel(v, 1 / 60, 5);
    for (let i = 0; i < 400 && fate === 'fly'; i++) fate = stepVoxel(v, 1 / 60, 5);
    expect(fate).toBe('rest');
    expect(v.z).toBe(5);
  });
});
