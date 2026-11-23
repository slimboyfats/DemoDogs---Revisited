import { describe, expect, it } from 'vitest';
import { fall } from '@demodogs/sim';
import { makeWorld, runUntil } from '../../../src/testing';

describe('prop.flyover-pillar', () => {
  it('brings its span of deck down with it', () => {
    const w = makeWorld({ venue: 'venue.knotwood' });
    const p = w.statics.find((s) => s.def.id === 'prop.flyover-pillar')!;
    expect(p).toBeDefined();
    const span = w.statics.filter((s) => s.group === p.group && s.def.id === 'prop.flyover-deck');
    expect(span.length).toBeGreaterThan(1);
    // one of the pair is enough: the deck sags, then goes piece by piece
    fall(w, p, p.x, p.y);
    expect(span.some((s) => s.down)).toBe(false);
    expect(span.every((s) => s.sagT !== undefined)).toBe(true);
    runUntil(w, () => w.sagging.length === 0, 60 * 3);
    expect(span.every((s) => s.down)).toBe(true);
  });
});
