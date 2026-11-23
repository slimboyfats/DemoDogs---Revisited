import { describe, expect, it } from 'vitest';
import { makeWorld, runUntil } from '../../../src/testing';

describe('venue.pinewood-sprint', () => {
  it('an all-AI race runs to the finish', () => {
    const w = makeWorld({ venue: 'venue.pinewood-sprint', car: 'car.mutt', autopilot: true });
    runUntil(w, (w) => w.phase === 'over', 60 * 240);
    expect(w.phase).toBe('over');
    expect(w.finishers.length).toBeGreaterThanOrEqual(1);
  });

  it('is mostly pines', () => {
    const w = makeWorld({ venue: 'venue.pinewood-sprint' });
    const pines = w.statics.filter((s) => s.def.id === 'prop.pine').length;
    expect(pines).toBeGreaterThan(w.statics.filter((s) => s.def.id === 'prop.tree').length);
    expect(pines).toBeGreaterThan(40);
  });
});
