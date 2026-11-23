import { describe, expect, it } from 'vitest';
import { assembled, restFrames, rolled, type Bone, type Part } from './looks';

/** A bar along y, one art pixel thick, in the middle of a 2 x 9 x 9 box. */
const bar: Part = {
  w: 2,
  h: 9,
  layers: 9,
  smooth: true,
  fn: (_x, y, z) => (Math.abs(z - 4.5) < 0.5 && Math.abs(y) < 4 ? 'wood' : null),
};
const block = (w: number, h: number, layers: number, m: string): Part => ({
  w,
  h,
  layers,
  smooth: true,
  fn: () => m,
});

describe('rolled', () => {
  it('turns a part about the axis it faces along, through its middle', () => {
    const up = rolled(bar, Math.PI / 2);
    // the bar that lay along y now stands along z
    expect(up.fn(0, 0, 1.5)).toBe('wood');
    expect(up.fn(0, 0, 7.5)).toBe('wood');
    expect(up.fn(0, 3, 4.5)).toBeNull();
    expect(bar.fn(0, 3, 4.5)).toBe('wood');
  });
  it('gives the part back for no turn, and loses what turns out of the box', () => {
    expect(rolled(bar, 0)).toBe(bar);
    const flat = block(2, 9, 3, 'wood');
    expect(rolled(flat, Math.PI / 2).fn(0, 0, 2.9)).toBe('wood');
    expect(rolled(flat, Math.PI / 2).fn(0, 4, 1.5)).toBeNull();
  });
});

describe('restFrames and assembled', () => {
  const bones: Bone[] = [
    { part: block(4, 4, 2, 'cap'), at: [0, 0, 10], face: Math.PI / 2 },
    { part: block(2, 2, 2, 'vane'), on: 0, at: [5, 0, 1] },
  ];
  it('stands each bone on the one it rides on, turned with it', () => {
    const F = restFrames(bones);
    expect(F[0]).toEqual([0, 0, 10, Math.PI / 2]);
    // five forward of a bone that faces +y is five along +y
    expect(F[1]![0]).toBeCloseTo(0);
    expect(F[1]![1]).toBeCloseTo(5);
    expect(F[1]![2]).toBe(11);
  });
  it('refuses a bone that rides on a later one', () => {
    expect(() => restFrames([{ part: bar, at: [0, 0, 0], on: 1 }])).toThrow();
  });
  it('puts the bare part and the bones together into one part that holds them all', () => {
    const whole = assembled(block(6, 6, 10, 'tower'), bones);
    expect(whole.layers).toBe(13);
    expect(whole.h).toBeGreaterThanOrEqual(12);
    expect(whole.fn(0, 0, 5)).toBe('tower');
    expect(whole.fn(0, 0, 10.5)).toBe('cap');
    expect(whole.fn(0, 5, 11.5)).toBe('vane');
    expect(whole.fn(5, 0, 11.5)).toBeNull();
    expect(whole.fn(2.9, 0, 11)).toBeNull();
  });
});
