import { describe, expect, it } from 'vitest';
import { makeWorld, runUntil } from '../../../src/testing';

describe('venue.the-pit', () => {
  it('a derby ends with one car running, the player out, or the clock', () => {
    const w = makeWorld({ venue: 'venue.the-pit', car: 'car.bruiser', autopilot: true });
    runUntil(w, (w) => w.phase === 'over', 60 * 200);
    expect(w.phase).toBe('over');
    const alive = w.cars.filter((c) => !c.wrecked).length;
    expect(alive <= 1 || w.player.wrecked || w.timeLeft <= 0).toBe(true);
  });

  it('keeps every car inside the bowl', () => {
    const w = makeWorld({ venue: 'venue.the-pit', autopilot: true });
    runUntil(w, () => false, 60 * 20);
    const O = w.oval!;
    for (const c of w.cars)
      expect(Math.hypot((c.x - O.cx) / O.rx, (c.y - O.cy) / O.ry)).toBeLessThan(1.01);
  });
});
