import { describe, expect, it } from 'vitest';
import { fall } from '@demodogs/sim';
import { makeWorld, propTest } from '../../../src/testing';

describe('prop.giant-oak', () => {
  it('stops a car dead: it is far too thick to ram down', () => {
    const r = propTest('prop.giant-oak', 190);
    expect(r.piece!.down).toBeUndefined();
  });

  it('carries its crowns up off the ground, and they come down with it', () => {
    const w = makeWorld({ venue: 'venue.knotwood' });
    const t = w.statics.find((s) => s.def.id === 'prop.giant-oak')!;
    const crowns = w.statics.filter((s) => s.group === t.group && s !== t);
    expect(crowns.length).toBeGreaterThan(2);
    expect(crowns.every((c) => (c.lift ?? 0) > 10 && !c.def.solid)).toBe(true);
    fall(w, t, t.x, t.y);
    expect(crowns.every((c) => c.down)).toBe(true);
  });
});
