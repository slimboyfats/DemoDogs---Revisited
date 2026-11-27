import { describe, expect, it } from 'vitest';
import { GEARS, PLAIN, engineNote, gearFor, revs } from './engine';

describe('engine gears', () => {
  it('changes up as the car gathers speed and the revs drop on each change', () => {
    let gear = 0;
    let last = revs(0, 0);
    let changes = 0;
    for (let f = 0; f <= 1; f += 0.005) {
      const g = gearFor(f, gear);
      const r = revs(f, g);
      if (g !== gear) {
        changes++;
        expect(r).toBeLessThan(last - 0.2);
      } else expect(r).toBeGreaterThanOrEqual(last);
      gear = g;
      last = r;
    }
    expect(changes).toBe(GEARS.length - 1);
    expect(last).toBeGreaterThan(0.85);
  });

  it('does not hunt between two gears at the speed of a change', () => {
    const up = gearFor(GEARS[1] + 0.01, 1);
    expect(up).toBe(2);
    expect(gearFor(GEARS[1] - 0.01, up)).toBe(2);
    expect(gearFor(GEARS[1] - 0.08, up)).toBe(1);
  });

  it('ticks over at a standstill and comes down through the gears', () => {
    expect(revs(0, 0)).toBeLessThan(0.2);
    expect(gearFor(0, 4)).toBe(0);
    expect(gearFor(2, 0)).toBe(GEARS.length - 1);
  });
});

describe('engine notes', () => {
  const mutt = { speed: 1, accel: 1, mass: 1 };

  it('the plain car is the plain note', () => {
    const n = engineNote(mutt);
    expect(n.pitch).toBeCloseTo(PLAIN.pitch);
    expect(n.lump).toBeCloseTo(PLAIN.lump);
    expect(n.rasp).toBeCloseTo(PLAIN.rasp);
    expect(n.whine).toBe(0);
  });

  it('a car nobody voiced still sounds like itself: heavy is low, quick rasps, the fastest whine', () => {
    const van = engineNote({ speed: 0.94, accel: 0.85, mass: 1.35 });
    const racer = engineNote({ speed: 1.16, accel: 1.22, mass: 1.05 });
    expect(van.pitch).toBeLessThan(0.85);
    expect(van.weight).toBeGreaterThan(0.7);
    expect(van.lump).toBeGreaterThan(racer.lump);
    expect(racer.rasp).toBeGreaterThan(van.rasp);
    expect(racer.whine).toBeGreaterThan(0.3);
    expect(van.whine).toBe(0);
  });

  it("the car's own say wins part by part, and stays in range", () => {
    const n = engineNote(mutt, { pitch: 9, whine: 0.6 });
    expect(n.pitch).toBe(1.6);
    expect(n.whine).toBe(0.6);
    expect(n.lump).toBeCloseTo(PLAIN.lump);
  });
});
