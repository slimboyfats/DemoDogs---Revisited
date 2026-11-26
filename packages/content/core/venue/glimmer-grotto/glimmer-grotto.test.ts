import { describe, expect, it } from 'vitest';
import { makeWorld, runUntil } from '../../../src/testing';

describe('venue.glimmer-grotto', () => {
  it('an all-AI race runs to the finish, every car lapping', () => {
    const w = makeWorld({ venue: 'venue.glimmer-grotto', autopilot: true });
    runUntil(w, (w) => w.phase === 'over', 60 * 300);
    expect(w.phase).toBe('over');
    expect(w.player.finished).toBe(true);
    for (const c of w.cars) expect(c.lap).toBeGreaterThanOrEqual(1);
  });

  it('is dark, and lit by what grows in it', () => {
    const w = makeWorld({ venue: 'venue.glimmer-grotto' });
    expect(w.venue.weather?.[0]?.sky).toBe('night');
    const glow = w.statics.filter((s) => /crystal|glow-shroom|lantern/.test(s.def.id));
    expect(glow.length).toBeGreaterThan(300);
    expect(w.paths.length).toBeGreaterThan(15);
  });
});
