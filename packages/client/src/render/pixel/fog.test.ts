import { describe, expect, it } from 'vitest';
import { FOG_SHEETS, fogGrid, fogNoise } from './fog';

describe('ground fog', () => {
  it('keeps the fluid small on every map: a few thousand cells, never finer than 6 px', () => {
    for (const [w, h] of [
      [1325, 1050],
      [2828, 1820],
      [3900, 2700],
    ] as const) {
      const g = fogGrid(w, h);
      expect(g.cell).toBeGreaterThanOrEqual(6);
      expect(Math.max(g.gw, g.gh)).toBeLessThanOrEqual(321);
      expect(g.gw * g.cell).toBeGreaterThanOrEqual(w);
      expect(g.gh * g.cell).toBeGreaterThanOrEqual(h);
    }
    // a small map is not given cells finer than a wheel
    expect(fogGrid(300, 200).cell).toBe(6);
  });

  it('paints a cloudy picture that fills black to white and is the same every time', () => {
    const a = fogNoise(64);
    expect(a).toEqual(fogNoise(64));
    for (let ch = 0; ch < 2; ch++) {
      let lo = 255;
      let hi = 0;
      let sum = 0;
      for (let i = ch; i < a.length; i += 2) {
        lo = Math.min(lo, a[i]!);
        hi = Math.max(hi, a[i]!);
        sum += a[i]!;
      }
      expect(lo).toBe(0);
      expect(hi).toBe(255);
      // (about half of it is fog at the middle threshold)
      expect(sum / (a.length / 2) / 255).toBeGreaterThan(0.35);
      expect(sum / (a.length / 2) / 255).toBeLessThan(0.65);
    }
  });

  it('repeats without a seam: the last column runs on into the first', () => {
    const n = 64;
    const a = fogNoise(n);
    let seam = 0;
    let inside = 0;
    for (let y = 0; y < n; y++) {
      seam += Math.abs(a[(y * n + n - 1) * 2]! - a[y * n * 2]!);
      inside += Math.abs(a[(y * n + 31) * 2]! - a[(y * n + 32) * 2]!);
    }
    expect(seam).toBeLessThan(inside * 2.5 + n * 4);
  });

  it('lies lower than a car is tall, in sheets that climb', () => {
    expect(FOG_SHEETS[0]).toBeGreaterThan(0);
    for (let i = 1; i < FOG_SHEETS.length; i++)
      expect(FOG_SHEETS[i]!).toBeGreaterThan(FOG_SHEETS[i - 1]!);
    expect(FOG_SHEETS[FOG_SHEETS.length - 1]!).toBeLessThan(8);
  });
});
