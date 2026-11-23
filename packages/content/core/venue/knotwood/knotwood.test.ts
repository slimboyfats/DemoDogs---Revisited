import { describe, expect, it } from 'vitest';
import { fall } from '@demodogs/sim';
import { bench, makeWorld, put, runUntil } from '../../../src/testing';

describe('venue.knotwood', () => {
  it('an all-AI race runs to the finish, every car lapping', () => {
    const w = makeWorld({ venue: 'venue.knotwood', autopilot: true });
    runUntil(w, (w) => w.phase === 'over', 60 * 300);
    expect(w.phase).toBe('over');
    expect(w.player.finished).toBe(true);
    for (const c of w.cars) expect(c.lap).toBeGreaterThanOrEqual(2);
  });

  it('cars climb onto the flyover on one pass and go under it on the other', () => {
    // (a seed whose race takes the player's car right under the middle of the deck)
    const w = makeWorld({ venue: 'venue.knotwood', autopilot: true, seed: 2 });
    const P = w.player;
    let top = 0;
    let under = 0;
    const H = w.deckH!;
    const mid = H.findIndex((h) => h >= 24);
    const cx = w.track!.x[mid + 20]!;
    const cy = w.track!.y[mid + 20]!;
    runUntil(
      w,
      () => {
        top = Math.max(top, P.deck);
        // the other pass, right under the deck
        if (P.deck === 0 && P.z < 2 && Math.hypot(P.x - cx, P.y - cy) < 30 && H[P.idx] === 0)
          under++;
        return top > 20 && under > 0;
      },
      60 * 120,
    );
    expect(top).toBeGreaterThan(20);
    expect(under).toBeGreaterThan(0);
  });

  it('lays out scenery the same way every time', () => {
    const a = makeWorld({ venue: 'venue.knotwood', seed: 1 });
    const b = makeWorld({ venue: 'venue.knotwood', seed: 2 });
    expect(a.statics.map((s) => [s.x, s.lift])).toEqual(b.statics.map((s) => [s.x, s.lift]));
  });

  it('a car on the deck drops through where a piece of it has come down', () => {
    const w = bench({ venue: 'venue.knotwood' });
    const T = w.track!;
    const P = w.player;
    const i = w.deckH!.findIndex((h) => h >= 24);
    put(P, T.x[i]!, T.y[i]!, T.a[i]!, 0);
    P.idx = i;
    P.z = 24;
    w.step();
    expect(P.deck).toBe(24);
    expect(P.z).toBe(24);
    fall(w, w.statics[w.deckPiece![i]!]!, P.x, P.y);
    runUntil(w, () => P.z === 0, 120);
    expect(P.deck).toBe(0);
    expect(P.z).toBe(0);
  });

  it('the rails keep a car on the deck', () => {
    const w = bench({ venue: 'venue.knotwood' });
    const T = w.track!;
    const P = w.player;
    const i = w.deckH!.findIndex((h) => h >= 24) + 6;
    // flat out straight across the deck at the rail
    put(P, T.x[i]!, T.y[i]!, T.a[i]! + Math.PI / 2, 150);
    P.idx = i;
    P.z = 24;
    runUntil(w, () => false, 60);
    expect(P.deck).toBe(24);
    const off =
      -(P.x - T.x[P.idx]!) * Math.sin(T.a[P.idx]!) + (P.y - T.y[P.idx]!) * Math.cos(T.a[P.idx]!);
    expect(Math.abs(off)).toBeLessThan(w.road / 2);
  });

  it('a car under the deck stays on the ground', () => {
    const w = bench({ venue: 'venue.knotwood' });
    const P = w.player;
    const T = w.track!;
    // the other pass, through the crossing under the deck
    let k = 0;
    for (let i = 0; i < T.n; i++)
      if (
        w.deckH![i] === 0 &&
        Math.hypot(T.x[i]! - 1000, T.y[i]! - 650) < Math.hypot(T.x[k]! - 1000, T.y[k]! - 650)
      )
        k = i;
    put(P, T.x[k]!, T.y[k]!, T.a[k]!, 120);
    P.idx = k;
    runUntil(w, () => false, 40);
    expect(P.z).toBe(0);
    expect(P.deck).toBe(0);
  });
});
