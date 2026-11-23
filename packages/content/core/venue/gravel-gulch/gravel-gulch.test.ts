import { describe, expect, it } from 'vitest';
import { makeWorld, runUntil } from '../../../src/testing';

describe('venue.gravel-gulch', () => {
  it('an all-AI race runs to the finish', () => {
    const w = makeWorld({ venue: 'venue.gravel-gulch', car: 'car.mutt', autopilot: true });
    runUntil(w, (w) => w.phase === 'over', 60 * 240);
    expect(w.phase).toBe('over');
    expect(w.finishers.length).toBeGreaterThanOrEqual(1);
  });

  it('is strewn with rocks', () => {
    const w = makeWorld({ venue: 'venue.gravel-gulch' });
    expect(w.statics.filter((s) => s.def.id === 'prop.rock').length).toBeGreaterThan(30);
  });
});
