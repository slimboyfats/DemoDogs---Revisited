import { describe, expect, it } from 'vitest';
import { explode, footing } from '@demodogs/sim';
import { makeWorld, openSpot, runUntil } from '../../../src/testing';

describe('venue.frostbite-quarry', () => {
  it('an all-AI race runs to the finish', () => {
    const w = makeWorld({ venue: 'venue.frostbite-quarry', car: 'car.mutt', autopilot: true });
    runUntil(w, (w) => w.phase === 'over', 60 * 300);
    expect(w.phase).toBe('over');
    expect(w.finishers.length).toBeGreaterThanOrEqual(1);
  });

  it('has ice on the road and off it from the start', () => {
    const w = makeWorld({ venue: 'venue.frostbite-quarry' });
    const ice = w.spills.filter((s) => s.fixed && s.def.id === 'material.ice');
    expect(ice.length).toBe(25);
    expect(ice.filter((s) => !w.offroad(s.x, s.y)).length).toBeGreaterThanOrEqual(11);
    expect(footing(w, ice[0]!.x, ice[0]!.y)[0]).toBeLessThan(0.1);
  });

  it('a blast digs a crater, and a second one in it only widens it', () => {
    const w = makeWorld({ venue: 'venue.frostbite-quarry' });
    const [x, y] = openSpot(w, 60);
    explode(w, x, y, 1, null);
    expect(w.craters.length).toBe(1);
    const r = w.craters[0]!.r;
    expect(footing(w, x + 2, y)[2]).toBe(true);
    expect(footing(w, x + r + 4, y)[2]).toBe(false);
    explode(w, x + 1, y, 1, null);
    expect(w.craters.length).toBe(1);
    expect(w.craters[0]!.r).toBeGreaterThan(r);
    expect(w.takeEvents().filter((e) => e.t === 'crater').length).toBe(2);
  });
});
