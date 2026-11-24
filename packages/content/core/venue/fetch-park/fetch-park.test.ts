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

  it('is a tidy place: a clean road, a launcher lobbing tennis balls onto it, in the toy look', () => {
    const w = makeWorld({ venue: 'venue.fetch-park' });
    expect(w.road).toBeGreaterThanOrEqual(44);
    expect(w.venue.colors.style).toBe('toy');
    const ball = (): number => w.props.filter((p) => p.def.id === 'prop.tennis-ball').length;
    const before = ball();
    runUntil(w, () => false, 60 * 12);
    expect(ball()).toBeGreaterThan(before + 2);
    // most of what it has thrown lies on the road (cars knock some off it)
    const thrown = w.throwers[0]!.balls.map((i) => w.props[i]!);
    const on = thrown.filter((p) => !w.offroad(p.x, p.y)).length;
    expect(on).toBeGreaterThanOrEqual(thrown.length / 2);
  });
});
