import { describe, expect, it } from 'vitest';
import { makeWorld, runUntil } from '../../../src/testing';

describe('venue.kennel-loop', () => {
  it('an all-AI race runs to the finish, every car lapping', () => {
    const w = makeWorld({ venue: 'venue.kennel-loop', autopilot: true });
    runUntil(w, (w) => w.phase === 'over', 60 * 180);
    expect(w.phase).toBe('over');
    expect(w.player.finished).toBe(true);
    for (const c of w.cars) expect(c.lap).toBeGreaterThanOrEqual(2);
  });

  it('lays out scenery the same way every time', () => {
    const a = makeWorld({ seed: 1 });
    const b = makeWorld({ seed: 2 });
    expect(a.statics.length).toBeGreaterThan(100);
    expect(a.statics.map((s) => s.x)).toEqual(b.statics.map((s) => s.x));
  });
});
