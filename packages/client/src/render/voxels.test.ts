import { describe, expect, it } from 'vitest';
import { launch, sample, stepVoxel, type Burst, type Voxel } from './voxels';

const mid = () => 0.5;
const burst: Burst = { x: 100, y: 50, h: 0, z: 1, ox: 100, oy: 50, speed: 80, vx: 0, vy: 0 };

describe('loose voxels', () => {
  it('fly away from the blast point', () => {
    const v = launch({ x: 4, y: 0, z: 3, rgb: 0x112233 }, burst, mid);
    expect(v.x).toBe(104);
    expect(v.z).toBe(4);
    expect(v.vx).toBeGreaterThan(0);
    expect(v.vz).toBeGreaterThan(0);
    expect(v.rgb).toBe(0x112233);
    const back = launch({ x: -4, y: 0, z: 0, rgb: 0 }, burst, mid);
    expect(back.vx).toBeLessThan(0);
  });

  it('turn with the thing they came off', () => {
    const v = launch({ x: 4, y: 0, z: 0, rgb: 0 }, { ...burst, h: Math.PI / 2 }, mid);
    expect(v.x).toBeCloseTo(100);
    expect(v.y).toBeCloseTo(54);
  });

  it('fall, bounce and come to rest on the ground', () => {
    const v: Voxel = launch({ x: 2, y: 1, z: 5, rgb: 0 }, burst, mid);
    let ticks = 0;
    let top = 0;
    while (!stepVoxel(v, 1 / 60) && ticks < 1000) {
      top = Math.max(top, v.z);
      ticks++;
    }
    expect(top).toBeGreaterThan(6);
    expect(v.z).toBe(0);
    expect(ticks).toBeLessThan(60 * 6);
  });

  it('are laid to rest after a while even if they never stop', () => {
    const v: Voxel = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rot: 0, spin: 0, rgb: 0, age: 5.99 };
    v.vx = 1000;
    v.z = 900;
    expect(stepVoxel(v, 1 / 60)).toBe(true);
  });

  it('sample keeps at most max items', () => {
    expect(sample([1, 2, 3, 4, 5], 3, mid)).toHaveLength(3);
    expect(sample([1, 2], 5, mid).sort()).toEqual([1, 2]);
  });
});
