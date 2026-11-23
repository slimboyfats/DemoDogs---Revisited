import { describe, expect, it } from 'vitest';
import { explode } from '@demodogs/sim';
import { makeWorld, propTest } from '../../../src/testing';

describe('prop.crane-leg', () => {
  it('stops a car and stands a ram', () => {
    const r = propTest('prop.crane-leg', 150);
    expect(r.blocked).toBe(true);
    expect(r.piece!.down).toBeFalsy();
  });

  it('take two legs out and the whole crane comes down', () => {
    const w = makeWorld({ venue: 'venue.rustwater-wharf' });
    const legs = w.statics.filter((s) => s.def.id === 'prop.crane-leg');
    const g = legs[0]!.group;
    const crane = w.statics.filter((s) => s.group === g);
    expect(crane.filter((s) => s.def.id === 'prop.crane-leg').length).toBe(4);
    expect(crane.filter((s) => s.def.id === 'prop.crane-beam').length).toBeGreaterThan(4);
    for (const leg of crane.filter((s) => s.def.id === 'prop.crane-leg').slice(0, 2))
      for (let i = 0; i < 8 && !leg.down; i++) explode(w, leg.x + 6, leg.y, 1.2, null);
    expect(crane.every((s) => s.down)).toBe(true);
  });
});
