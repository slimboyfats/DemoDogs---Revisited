import { describe, expect, it } from 'vitest';
import { explode } from '@demodogs/sim';
import { makeWorld } from '../../../src/testing';

describe('prop.flyover-deck', () => {
  it('stands up off the ground and is no wall to cars under it', () => {
    const w = makeWorld({ venue: 'venue.knotwood' });
    const decks = w.statics.filter((s) => s.def.id === 'prop.flyover-deck');
    expect(decks.length).toBeGreaterThan(20);
    expect(decks.every((s) => !s.def.solid && (s.lift ?? -9) > -5)).toBe(true);
  });

  it('a big enough blast brings a piece down and leaves a hole in the road', () => {
    const w = makeWorld({ venue: 'venue.knotwood' });
    const T = w.track!;
    const i = w.deckH!.findIndex((h) => h > 20);
    const s = w.statics[w.deckPiece![i]!]!;
    for (let k = 0; k < 6 && !s.down; k++) explode(w, s.x, s.y, 2, null);
    expect(s.down).toBe(true);
    expect(w.deckAt(i)).toBe(0);
    expect(T.n).toBeGreaterThan(0);
  });
});
