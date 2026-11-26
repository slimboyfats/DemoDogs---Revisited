import { describe, expect, it } from 'vitest';
import { makeWorld, runUntil } from '../../../src/testing';

describe('venue.tar-flats', () => {
  it('a derby ends with one car running, the player out, or the clock', () => {
    const w = makeWorld({ venue: 'venue.tar-flats', car: 'car.bruiser', autopilot: true });
    runUntil(w, (w) => w.phase === 'over', 60 * 200);
    expect(w.phase).toBe('over');
    const alive = w.cars.filter((c) => !c.wrecked).length;
    expect(alive <= 1 || w.player.wrecked || w.timeLeft <= 0).toBe(true);
  });

  it('starts with tar pits, and the derby sets them alight and craters the ground', () => {
    const w = makeWorld({ venue: 'venue.tar-flats', autopilot: true, seed: 10 });
    const tar = () => w.spills.filter((s) => s.fixed && s.def.id === 'material.tar').length;
    expect(tar()).toBe(16);
    expect(w.statics.filter((s) => s.def.id === 'prop.gas-pump').length).toBeGreaterThan(5);
    runUntil(w, (w) => w.phase === 'over', 60 * 120);
    expect(tar()).toBeLessThan(16);
    expect(w.craters.length).toBeGreaterThan(3);
  });
});
