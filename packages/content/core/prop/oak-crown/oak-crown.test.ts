import { describe, expect, it } from 'vitest';
import { explode } from '@demodogs/sim';
import { makeWorld } from '../../../src/testing';

describe('prop.oak-crown', () => {
  it('is no wall to cars, and a blast tears its leaves off', () => {
    const w = makeWorld({ venue: 'venue.knotwood' });
    const s = w.statics.find((s) => s.def.id === 'prop.oak-crown')!;
    expect(s.def.solid).toBe(false);
    w.takeEvents();
    explode(w, s.x + 40, s.y, 1, null);
    expect(s.leaves).toBeLessThan(1);
    expect(w.takeEvents().some((e) => e.t === 'strip' && e.prop === s.index)).toBe(true);
  });
});
