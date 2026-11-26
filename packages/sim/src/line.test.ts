import { describe, expect, it } from 'vitest';
import { racingLine } from './line';
import { sampleTrack } from './track';

const T = sampleTrack(
  [
    [200, 200],
    [900, 180],
    [1000, 500],
    [700, 620],
    [520, 480],
    [300, 700],
    [150, 500],
  ],
  4,
);
const HALF = 56;

function length(x: ArrayLike<number>, y: ArrayLike<number>): number {
  let d = 0;
  for (let i = 0; i < x.length; i++) {
    const j = (i + 1) % x.length;
    d += Math.hypot(x[j]! - x[i]!, y[j]! - y[i]!);
  }
  return d;
}

describe('racingLine', () => {
  const L = racingLine(T, HALF);

  it('stays inside the road, a margin off its edges', () => {
    for (let i = 0; i < T.n; i++) expect(Math.abs(L.off[i]!)).toBeLessThanOrEqual(HALF - 16 + 0.01);
  });

  it('is a shorter way round than the middle of the road, and bends less', () => {
    expect(length(L.x, L.y)).toBeLessThan(length(T.x, T.y) * 0.99);
    const centre = racingLine(T, 16);
    const worst = (k: Float32Array) => k.reduce((a, b) => Math.max(a, Math.abs(b)), 0);
    expect(worst(L.k)).toBeLessThan(worst(centre.k));
  });

  it('has no kinks: neighbouring samples are close across the road', () => {
    for (let i = 0; i < T.n; i++)
      expect(Math.abs(L.off[i]! - L.off[(i + 1) % T.n]!)).toBeLessThan(2.5);
  });

  it('is the same every time', () => {
    expect([...racingLine(T, HALF).off]).toEqual([...L.off]);
  });

  it('with no room to move is the middle of the road', () => {
    const none = racingLine(T, 10);
    expect(none.off.every((o) => o === 0)).toBe(true);
  });

  it('keeps a radius on the inside of a hairpin', () => {
    const pin = sampleTrack(
      [
        [100, 100],
        [800, 100],
        [840, 150],
        [800, 200],
        [100, 220],
        [60, 160],
      ],
      4,
    );
    // (no tighter than the road's own middle, though the road's inside edge is far tighter)
    const worst = (k: Float32Array) => k.reduce((a, b) => Math.max(a, Math.abs(b)), 0);
    expect(worst(racingLine(pin, 70).k)).toBeLessThan(worst(racingLine(pin, 16).k) * 1.1);
  });
});
