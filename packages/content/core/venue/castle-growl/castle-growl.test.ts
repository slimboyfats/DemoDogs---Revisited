import { describe, expect, it } from 'vitest';
import { makeWorld, runUntil } from '../../../src/testing';

describe('venue.castle-growl', () => {
  it('an all-AI race runs to the finish, every car lapping', () => {
    const w = makeWorld({ venue: 'venue.castle-growl', autopilot: true });
    runUntil(w, (w) => w.phase === 'over', 60 * 300);
    expect(w.phase).toBe('over');
    expect(w.player.finished).toBe(true);
    for (const c of w.cars) expect(c.lap).toBeGreaterThanOrEqual(1);
  });

  it('runs through a castle: gates over the road all round the lap, and a walled ward between two of them', () => {
    const w = makeWorld({ venue: 'venue.castle-growl' });
    const arch = w.statics.filter((s) => s.def.id === 'prop.castle-arch');
    // (the ward's two, and four more round the lap, each with a run of wall either side)
    expect(new Set(arch.map((s) => s.group)).size).toBeGreaterThanOrEqual(5);
    expect(arch.every((s) => !w.offroad(s.x, s.y) || w.grid!.at(s.x, s.y) < w.road)).toBe(true);
    expect(w.statics.filter((s) => s.def.id === 'prop.castle-wall').length).toBeGreaterThan(300);
    // the ward's road is clear from gate to gate
    const T = w.track!;
    for (let i = Math.floor(0.41 * T.n); i < 0.53 * T.n; i += 5)
      expect(
        w.statics.some(
          (s) =>
            s.def.solid &&
            !s.def.pad &&
            s.def.id.startsWith('prop.castle') &&
            Math.hypot(s.x - T.x[i]!, s.y - T.y[i]!) < w.road / 2 + s.def.radius,
        ),
      ).toBe(false);
  });
});
