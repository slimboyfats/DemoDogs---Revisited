import { describe, expect, it } from 'vitest';
import { nearestFirstOrder } from './stack-batch';

function order(keys: number[], lo = 0, hi = 100): number[] {
  const n = keys.length;
  const out = nearestFirstOrder(
    Float32Array.from(keys),
    n,
    lo,
    hi,
    new Uint32Array(n),
    new Uint32Array(n),
    new Uint32Array(n),
    new Uint32Array(2049),
  );
  return [...out.subarray(0, n)];
}

describe('nearestFirstOrder', () => {
  it('puts the largest depth key (nearest) first', () => {
    expect(order([10, 90, 50, 0, 100])).toEqual([4, 1, 2, 0, 3]);
  });

  it('keeps queued order among equal keys', () => {
    expect(order([5, 7, 5, 7, 5])).toEqual([1, 3, 0, 2, 4]);
  });

  it('clamps keys outside the range and sorts across both radix digits', () => {
    const keys = Array.from({ length: 5000 }, (_, i) => ((i * 7919) % 5000) / 50 - 5);
    const c = (v: number) => Math.max(0, Math.min(100, v));
    const got = order(keys, 0, 100).map((i) => c(keys[i]!));
    for (let i = 1; i < got.length; i++) expect(got[i - 1]!).toBeGreaterThanOrEqual(got[i]! - 1e-4);
  });

  it('separates keys a hair apart', () => {
    expect(order([50, 50.001, 49.999])).toEqual([1, 0, 2]);
  });
});
