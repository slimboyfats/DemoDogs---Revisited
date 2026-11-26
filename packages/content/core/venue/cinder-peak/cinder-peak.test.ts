import { describe, expect, it } from 'vitest';
import { makeWorld, runUntil } from '../../../src/testing';

describe('venue.cinder-peak', () => {
  it('an all-AI race runs to the finish, every car lapping', () => {
    const w = makeWorld({ venue: 'venue.cinder-peak', autopilot: true });
    runUntil(w, (w) => w.phase === 'over', 60 * 300);
    expect(w.phase).toBe('over');
    expect(w.player.finished).toBe(true);
    for (const c of w.cars) expect(c.lap).toBeGreaterThanOrEqual(1);
  });

  it('is a ring round a stepped mountain: high ground inside the loop, level ground outside it', () => {
    const w = makeWorld({ venue: 'venue.cinder-peak' });
    const R = w.relief!;
    expect(R.at(w.w / 2, w.h / 2 - 100)).toBeGreaterThan(80);
    expect(R.at(60, 60)).toBeLessThan(12);
    expect(w.pads.filter((s) => s.def.pad!.kind === 'vent').length).toBe(4);
    expect(w.paths.length).toBeGreaterThan(8);
    expect(w.statics.some((s) => s.def.id === 'prop.crater')).toBe(true);
  });
});
