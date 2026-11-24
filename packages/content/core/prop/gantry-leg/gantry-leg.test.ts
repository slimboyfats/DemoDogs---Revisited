import { describe, expect, it } from 'vitest';
import { fall } from '@demodogs/sim';
import { makeWorld, propTest } from '../../../src/testing';

describe('prop.gantry-leg', () => {
  it('stands solid beside the road', () => {
    const r = propTest('prop.gantry-leg', 60);
    expect(r.blocked).toBe(true);
  });

  it('holds up the start gantry: fell a leg and the beam comes down too', () => {
    const w = makeWorld({ venue: 'venue.kennel-loop' });
    const legs = w.statics.filter((s) => s.def.id === 'prop.gantry-leg');
    expect(legs).toHaveLength(2);
    const beams = w.statics.filter((s) => s.def.id === 'prop.gantry-beam');
    expect(beams.length).toBeGreaterThan(3);
    fall(w, legs[0]!, legs[0]!.x, legs[0]!.y);
    expect(beams.every((s) => s.down)).toBe(true);
  });
});
