import { describe, expect, it } from 'vitest';
import { Rng } from './prng';
import { Hasher, angDiff, clamp } from './math';

describe('Rng', () => {
  it('replays from a seed and differs across seeds', () => {
    const a = new Rng(5);
    const b = new Rng(5);
    const c = new Rng(6);
    const sa = Array.from({ length: 5 }, () => a.next());
    expect(sa).toEqual(Array.from({ length: 5 }, () => b.next()));
    expect(sa).not.toEqual(Array.from({ length: 5 }, () => c.next()));
    for (const v of sa) expect(v >= 0 && v < 1).toBe(true);
  });

  it('range, int, pick and shuffle stay in bounds', () => {
    const r = new Rng(1);
    for (let i = 0; i < 100; i++) {
      const v = r.range(3, 4);
      expect(v >= 3 && v < 4).toBe(true);
      expect(r.int(3)).toBeLessThan(3);
    }
    expect(['a', 'b']).toContain(r.pick(['a', 'b']));
    expect(() => r.pick([])).toThrow();
    expect(r.shuffle([1, 2, 3, 4]).sort()).toEqual([1, 2, 3, 4]);
  });
});

describe('math', () => {
  it('angDiff wraps to (-PI, PI]', () => {
    expect(angDiff(0.1, Math.PI * 2)).toBeCloseTo(0.1);
    expect(angDiff(-3, 3)).toBeCloseTo(2 * Math.PI - 6);
  });
  it('clamp', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
  });
  it('hashes stably', () => {
    expect(new Hasher().num(1.5).str('x').hex()).toBe(new Hasher().num(1.5).str('x').hex());
    expect(new Hasher().num(1.5).hex()).not.toBe(new Hasher().num(1.6).hex());
  });
});
