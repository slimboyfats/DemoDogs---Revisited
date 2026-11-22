import { describe, expect, it } from 'vitest';
import { ARC_RAMP, SKind, Sparks } from './sparks';

/** A fixed sequence instead of Math.random, so the cells land the same way every run. */
const seq = () => {
  let s = 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};

describe('Sparks', () => {
  it('lays a bolt down as cells about one art px apart, from end to end', () => {
    const s = new Sparks(4000, seq());
    const n = s.bolt(0, 0, 0, 40, 0, 0, 0.2, false);
    expect(n).toBeGreaterThanOrEqual(45);
    const at: [number, number][] = [];
    s.draw(
      () => {},
      (x, y) => at.push([x, y]),
      () => true,
    );
    expect(Math.min(...at.map((p) => p[0]))).toBeLessThan(1);
    expect(Math.max(...at.map((p) => p[0]))).toBeGreaterThan(39);
  });

  it('draws every cell as a single additive cell in the arc colours', () => {
    const s = new Sparks(100, seq());
    s.shower(0, 0, 5, 20);
    const cols = new Set<number>();
    s.draw(
      () => {
        throw new Error('sparks are never drawn opaque');
      },
      (_x, _y, _z, d, rgb) => {
        expect(d).toBeLessThanOrEqual(2);
        cols.add(rgb);
      },
      () => true,
    );
    expect([...cols].some((c) => ARC_RAMP.includes(c))).toBe(true);
  });

  it('sparks fall, skip off the ground and burn out; bolts stay put and burn out faster', () => {
    const s = new Sparks(10, seq());
    s.add(SKind.Spark, 0, 0, 10, 30, 0, 0, 1);
    s.add(SKind.Bolt, 5, 5, 3, 0, 0, 0, 0.1);
    for (let i = 0; i < 12; i++) s.step(1 / 60);
    expect(s.n).toBe(1);
    for (let i = 0; i < 120; i++) s.step(1 / 60);
    expect(s.n).toBe(0);
  });

  it('never holds more than its capacity', () => {
    const s = new Sparks(50, seq());
    s.bolt(0, 0, 0, 300, 0, 0);
    expect(s.n).toBe(50);
  });
});
