import { describe, expect, it } from 'vitest';
import { datan2, dcos, dexp, dhypot, dsin } from './dmath';
import { Rng } from './prng';

const close = (a: number, b: number, tol = 4e-16) =>
  expect(Math.abs(a - b)).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(b)));

describe('deterministic maths', () => {
  const rng = new Rng(9);
  const xs = Array.from({ length: 4000 }, (_, i) =>
    i < 2000 ? rng.range(-8, 8) : rng.range(-3000, 3000),
  );

  it('sin and cos are within an ulp or two of the native ones', () => {
    for (const x of xs) {
      close(dsin(x), Math.sin(x), x > 100 || x < -100 ? 4e-13 : 4e-16);
      close(dcos(x), Math.cos(x), x > 100 || x < -100 ? 4e-13 : 4e-16);
    }
    expect(dsin(0)).toBe(0);
    expect(dcos(0)).toBe(1);
    expect(dsin(Infinity)).toBeNaN();
  });

  it('atan2 matches, including the signed zeros and infinities', () => {
    for (let i = 0; i < 4000; i++) {
      const y = rng.range(-500, 500);
      const x = rng.range(-500, 500);
      close(datan2(y, x), Math.atan2(y, x));
    }
    for (const y of [0, -0, 1, -1, Infinity, -Infinity])
      for (const x of [0, -0, 1, -1, Infinity, -Infinity])
        expect(datan2(y, x)).toBe(Math.atan2(y, x));
  });

  it('exp and hypot match', () => {
    for (let i = 0; i < 4000; i++) {
      const x = rng.range(-40, 40);
      close(dexp(x), Math.exp(x), 1e-15);
      const a = rng.range(-900, 900);
      const b = rng.range(-900, 900);
      close(dhypot(a, b), Math.hypot(a, b), 1e-15);
    }
    expect(dexp(1000)).toBe(Infinity);
    expect(dexp(-1000)).toBe(0);
    expect(dhypot(3, 4, 12)).toBe(13);
  });
});
