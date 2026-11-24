import { describe, expect, it } from 'vitest';
import { makeWorld, runUntil } from '../../../src/testing';

describe('venue.fetch-park', () => {
  it('an all-AI race runs to the finish, every car lapping', () => {
    const w = makeWorld({ venue: 'venue.fetch-park', autopilot: true });
    runUntil(w, (w) => w.phase === 'over', 60 * 180);
    expect(w.phase).toBe('over');
    expect(w.player.finished).toBe(true);
    for (const c of w.cars) expect(c.lap).toBeGreaterThanOrEqual(2);
  });

  it('is a tidy place: a wide road, tennis balls on it, and little else standing about', () => {
    const w = makeWorld({ venue: 'venue.fetch-park' });
    expect(w.road).toBeGreaterThanOrEqual(96);
    expect(w.props.filter((p) => p.def.id === 'prop.tennis-ball').length).toBeGreaterThanOrEqual(8);
    expect(w.venue.colors.style).toBe('toy');
  });
});
