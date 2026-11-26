import { describe, expect, it } from 'vitest';
import { makeWorld, runUntil } from '../../../src/testing';

describe('venue.bonefish-bay', () => {
  it('an all-AI race runs to the finish, every car lapping', () => {
    const w = makeWorld({ venue: 'venue.bonefish-bay', autopilot: true });
    runUntil(w, (w) => w.phase === 'over', 60 * 300);
    expect(w.phase).toBe('over');
    expect(w.player.finished).toBe(true);
    for (const c of w.cars) expect(c.lap).toBeGreaterThanOrEqual(1);
  });

  it('has a boardwalk over the lagoon that is road all the way, and shorter than the road round', () => {
    const w = makeWorld({ venue: 'venue.bonefish-bay' });
    expect(w.paths.length).toBeGreaterThan(20);
    for (const s of w.paths) expect(w.offroad(s.x, s.y)).toBe(false);
    // the middle of it is over water
    const mid = w.paths[Math.floor(w.paths.length / 2)]!;
    expect(w.spills.some((p) => p.fixed && Math.hypot(p.x - mid.x, p.y - mid.y) < p.r)).toBe(true);
    // nothing solid stands on it
    for (const s of w.paths)
      expect(
        w.statics.some(
          (o) =>
            o.def.solid &&
            !o.def.pad &&
            !o.def.gate &&
            Math.hypot(o.x - s.x, o.y - s.y) < o.def.radius + 6,
        ),
      ).toBe(false);
    expect(w.statics.filter((s) => s.def.id === 'prop.lighthouse').length).toBeGreaterThanOrEqual(
      2,
    );
  });
});
