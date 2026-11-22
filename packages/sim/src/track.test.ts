import { describe, expect, it } from 'vitest';
import { DistanceGrid, sampleTrack } from './track';

const square: [number, number][] = [
  [100, 100],
  [300, 100],
  [300, 300],
  [100, 300],
];

describe('track', () => {
  it('samples a closed curve at an even spacing', () => {
    const T = sampleTrack(square, 4);
    expect(T.n).toBeGreaterThan(100);
    for (let i = 1; i < T.n; i++)
      expect(Math.hypot(T.x[i]! - T.x[i - 1]!, T.y[i]! - T.y[i - 1]!)).toBeCloseTo(4, 0);
    expect(T.len).toBe(T.n * 4);
  });

  it('answers distance to the road and the nearest sample', () => {
    const T = sampleTrack(square, 4);
    const g = new DistanceGrid(T, 400, 400, 6, 60);
    expect(g.at(T.x[10]!, T.y[10]!)).toBeLessThan(6);
    expect(g.at(200, 200)).toBeGreaterThan(40);
    expect(g.at(-50, 0)).toBe(1e4);
    expect(g.nearest(T.x[10]!, T.y[10]!)).toBeGreaterThanOrEqual(0);
    expect(g.nearest(-50, 0)).toBe(-1);
  });
});
