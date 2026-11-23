import { describe, expect, it } from 'vitest';
import { batter, fall } from '@demodogs/sim';
import { makeWorld, propTest } from '../../../src/testing';

describe('prop.arch-span', () => {
  it('stands overhead: a car drives straight under it', () => {
    const r = propTest('prop.arch-span', 120);
    expect(r.blocked).toBe(false);
    expect(r.piece!.down).toBeFalsy();
  });

  it('in a canyon, knocking out one leg brings the whole arch down onto the road', () => {
    const w = makeWorld({ venue: 'venue.sunbake-canyon' });
    const spans = w.statics.filter((s) => s.def.id === 'prop.arch-span');
    expect(spans.length).toBeGreaterThan(10);
    const g = spans[0]!.group!;
    const leg = w.statics.find((s) => s.group === g && s.bears)!;
    const before = w.statics.length;
    fall(w, leg, leg.x, leg.y);
    const arch = w.statics.filter((s) => s.group === g);
    expect(arch.every((s) => s.down)).toBe(true);
    const rocks = w.statics.slice(before).filter((s) => s.def.id === 'prop.rockfall');
    expect(rocks.length).toBeGreaterThan(0);
    // the slabs land on the road the arch stood over
    expect(rocks.some((s) => !w.offroad(s.x, s.y))).toBe(true);
    expect(batter(w, rocks[0]!, 1, 'impact', rocks[0]!.x, rocks[0]!.y)).toBe(false);
  });
});
