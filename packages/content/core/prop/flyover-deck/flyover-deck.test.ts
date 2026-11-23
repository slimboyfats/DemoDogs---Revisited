import { describe, expect, it } from 'vitest';
import { explode } from '@demodogs/sim';
import { REBUILD_TIME } from '@demodogs/shared';
import { makeWorld, runUntil } from '../../../src/testing';

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

  it('flies back together after a while, so the race is not cut in two for good', () => {
    const w = makeWorld({ venue: 'venue.knotwood', rivals: 0 });
    const i = w.deckH!.findIndex((h) => h > 20);
    const s = w.statics[w.deckPiece![i]!]!;
    for (let k = 0; k < 6 && !s.down; k++) explode(w, s.x, s.y, 2, null);
    expect(s.down).toBe(true);
    w.takeEvents();
    let mend = -1;
    const n = runUntil(
      w,
      (w) => {
        for (const e of w.takeEvents()) if (e.t === 'mend' && e.prop === s.index) mend = w.tick;
        return !s.down;
      },
      60 * 30,
    );
    expect(s.down).toBe(false);
    expect(s.hp).toBe(s.def.integrity);
    expect(w.deckAt(i)).toBeGreaterThan(20);
    expect(n / 60).toBeCloseTo(s.def.rebuild!, 0);
    expect(mend).toBeGreaterThan(0);
    expect((w.tick - mend) / 60).toBeCloseTo(REBUILD_TIME, 1);
  });
});
