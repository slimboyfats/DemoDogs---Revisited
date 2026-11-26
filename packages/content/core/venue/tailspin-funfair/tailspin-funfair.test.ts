import { describe, expect, it } from 'vitest';
import { makeWorld, runUntil } from '../../../src/testing';

describe('venue.tailspin-funfair', () => {
  it('an all-AI race runs to the finish, every car lapping', () => {
    const w = makeWorld({ venue: 'venue.tailspin-funfair', autopilot: true });
    runUntil(w, (w) => w.phase === 'over', 60 * 300);
    expect(w.phase).toBe('over');
    expect(w.player.finished).toBe(true);
    for (const c of w.cars) expect(c.lap).toBeGreaterThanOrEqual(1);
  });

  it('crosses itself on a flyover, and has a way through the bumpers', () => {
    const w = makeWorld({ venue: 'venue.tailspin-funfair' });
    expect(w.deckH?.some((h) => h > 20)).toBe(true);
    expect(w.statics.filter((s) => s.def.bounce).length).toBeGreaterThan(10);
    expect(w.paths.length).toBeGreaterThan(20);
    expect(w.statics.some((s) => s.def.id === 'prop.ferris-wheel')).toBe(true);
  });
});
