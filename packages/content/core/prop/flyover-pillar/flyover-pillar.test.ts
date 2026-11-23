import { describe, expect, it } from 'vitest';
import { fall } from '@demodogs/sim';
import { makeWorld } from '../../../src/testing';

describe('prop.flyover-pillar', () => {
  it('brings its span of deck down with it', () => {
    const w = makeWorld({ venue: 'venue.knotwood' });
    const p = w.statics.find((s) => s.def.id === 'prop.flyover-pillar')!;
    expect(p).toBeDefined();
    const span = w.statics.filter((s) => s.group === p.group && s.def.id === 'prop.flyover-deck');
    expect(span.length).toBeGreaterThan(1);
    for (const o of w.statics) if (o.group === p.group && o.bears) fall(w, o, o.x, o.y);
    expect(span.every((s) => s.down)).toBe(true);
  });
});
