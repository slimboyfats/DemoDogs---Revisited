import { describe, expect, it } from 'vitest';
import { makeWorld, runUntil } from '../../../src/testing';

describe('venue.scrapyard-run', () => {
  it('an all-AI race runs to the finish', () => {
    const w = makeWorld({ venue: 'venue.scrapyard-run', car: 'car.pug', autopilot: true });
    runUntil(w, (w) => w.phase === 'over', 60 * 220);
    expect(w.phase).toBe('over');
    expect(w.finishers.length).toBeGreaterThanOrEqual(1);
  });

  it('is full of junk', () => {
    const w = makeWorld({ venue: 'venue.scrapyard-run' });
    expect(w.statics.filter((s) => s.def.id.startsWith('prop.husk')).length).toBeGreaterThan(5);
  });
});
