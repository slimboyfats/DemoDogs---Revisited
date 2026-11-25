import { describe, expect, it } from 'vitest';
import { DIAL_DEFAULT, Speedo, dialSpot, fitDial } from './speedo';

function memory() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => m.set(k, v),
  };
}

describe('speedometer settings', () => {
  it('starts on, bottom middle, at its own size', () => {
    expect(new Speedo(memory()).setup).toEqual(DIAL_DEFAULT);
  });

  it('remembers what was picked on this device', () => {
    const store = memory();
    const a = new Speedo(store);
    a.toggle();
    a.set({ size: 1.4 });
    const b = new Speedo(store);
    expect(b.setup.on).toBe(false);
    expect(b.setup.size).toBe(1.4);
    // picking a place shows it again
    b.nextPlace();
    expect(b.setup).toEqual({ on: true, place: 'left', size: 1.4 });
  });

  it('makes sense of nonsense', () => {
    expect(fitDial({ on: 'yes', place: 'moon', size: 99 })).toEqual({
      on: true,
      place: 'middle',
      size: 1.8,
    });
    expect(fitDial(null)).toEqual(DIAL_DEFAULT);
  });

  it('keeps the dial on the screen wherever it goes, at any size', () => {
    for (const place of ['middle', 'left', 'top'] as const)
      for (const size of [0.6, 1, 1.8]) {
        const r = 40 * 2 * size;
        const s = dialSpot(place, 1688, 780, r, 2);
        expect(s.x - r * 1.22).toBeGreaterThan(0);
        expect(s.x + r * 1.22).toBeLessThan(1688);
        expect(s.y - r * 1.22).toBeGreaterThan(0);
        expect(s.y + r * 0.85).toBeLessThan(780);
      }
  });
});
