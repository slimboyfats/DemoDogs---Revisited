import { describe, expect, it } from 'vitest';
import { flatBench, put, runUntil } from '../../../src/testing';

const RAIN = ['modifier.downpour'];

/** How far round a car flat out on full lock has turned after a second. */
function turned(modifiers: string[]): number {
  const w = flatBench({ modifiers });
  const c = w.player;
  put(c, w.oval!.cx, w.oval!.cy, 0, 150);
  for (let i = 0; i < 60; i++)
    w.step({ steer: 1, throttle: 1, brake: false, boost: false, fire: false });
  return c.h;
}

describe('modifier.downpour', () => {
  it('takes grip: a car on full lock runs wider in the rain than in the dry', () => {
    expect(turned(RAIN)).toBeLessThan(turned([]) * 0.93);
    expect(turned(RAIN)).toBeGreaterThan(turned([]) * 0.6);
  });

  it('puts out fire on the ground', () => {
    const w = flatBench({ modifiers: RAIN });
    for (let i = 0; i < 6; i++)
      w.blazes.push({ x: 300 + i * 30, y: 300, r: 9, t: 60, bite: 0.25, owner: -1 });
    w.takeEvents();
    runUntil(w, (w) => w.blazes.length === 0, 60 * 30);
    expect(w.blazes.length).toBe(0);
  });

  it('gathers puddles of water, and no more than it says', () => {
    const w = flatBench({ modifiers: RAIN });
    runUntil(w, () => false, 60 * 100);
    const puddles = w.spills.filter((s) => s.def.id === 'material.water');
    expect(puddles.length).toBe(8);
  });
});
