import { describe, expect, it } from 'vitest';
import { batter } from '@demodogs/sim';
import { makeWorld } from '../../../src/testing';

describe('prop.elm-crown', () => {
  it('hangs high in its tree and fire strips its leaves', () => {
    const w = makeWorld({ venue: 'venue.knotwood' });
    const s = w.statics.find((s) => s.def.id === 'prop.elm-crown')!;
    expect(s.lift).toBeGreaterThan(10);
    batter(w, s, 4, 'heat', s.x, s.y);
    expect(s.leaves).toBeLessThan(1);
  });
});
