import { describe, expect, it } from 'vitest';
import { Resolution, resSteps } from './resolution';

describe('resolution steps', () => {
  it('starts where it always has: the device, at most two', () => {
    expect(resSteps(3, 390)[0]).toBe(2);
    expect(resSteps(2, 390)[0]).toBe(2);
    expect(resSteps(1, 900)[0]).toBe(1);
  });

  it('steps down by whole numbers of device pixels', () => {
    expect(resSteps(3, 390)).toEqual([2, 1.5, 1]);
    expect(resSteps(2, 390)).toEqual([2, 1]);
    expect(resSteps(1, 900)).toEqual([1, 0.5]);
    for (const dpr of [1, 1.5, 2, 2.625, 3, 4])
      for (const v of resSteps(dpr, 420).slice(1)) expect(dpr / v).toBeCloseTo(Math.round(dpr / v));
  });

  it('never goes so low that an art pixel is under two canvas pixels', () => {
    expect(resSteps(1, 390)).toEqual([1]);
    for (const dpr of [1, 2, 2.625, 3])
      for (const v of resSteps(dpr, 360)) expect(v * 360).toBeGreaterThanOrEqual(330);
  });

  it('survives a nonsense device ratio', () => {
    expect(resSteps(0, 400)).toEqual([1]);
    expect(resSteps(NaN, 400)).toEqual([1]);
  });
});

describe('Resolution', () => {
  const store = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
    };
  };

  it('auto starts full and drops a step at a time, to the bottom and no further', () => {
    const r = new Resolution();
    expect(r.pick(3, 390)).toBe(2);
    expect(r.drop(3, 390)).toBe(true);
    expect(r.pick(3, 390)).toBe(1.5);
    expect(r.drop(3, 390)).toBe(true);
    expect(r.pick(3, 390)).toBe(1);
    expect(r.drop(3, 390)).toBe(false);
    // a screen with fewer steps takes the lowest it has
    expect(r.pick(2, 390)).toBe(1);
  });

  it('full never drops and low starts at the bottom', () => {
    const s = store();
    const r = new Resolution(s);
    expect(r.next()).toBe('full');
    expect(r.drop(3, 390)).toBe(false);
    expect(r.pick(3, 390)).toBe(2);
    expect(r.next()).toBe('low');
    expect(r.pick(3, 390)).toBe(1);
    // saved for the next visit
    expect(new Resolution(s).mode).toBe('low');
    expect(r.next()).toBe('auto');
    expect(r.pick(3, 390)).toBe(2);
  });

  it('takes a mode from the address for one visit, and ignores nonsense', () => {
    const s = store();
    expect(new Resolution(s, 'low').mode).toBe('low');
    expect(new Resolution(s).mode).toBe('auto');
    expect(new Resolution(s, 'huge').mode).toBe('auto');
  });

  it('works where the browser will not store', () => {
    const broken = {
      getItem: (): string | null => {
        throw new Error('no');
      },
      setItem: (): void => {
        throw new Error('no');
      },
    };
    const r = new Resolution(broken);
    expect(r.mode).toBe('auto');
    expect(r.next()).toBe('full');
  });
});
