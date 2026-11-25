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
    // the middle of the deck's full height, where the other pass crosses under it
    const full = [...H.keys()].filter((i) => H[i]! >= 24);
    const mid = full[full.length >> 1]!;
    const cx = w.track!.x[mid]!;
    const cy = w.track!.y[mid]!;
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

  it('a span whose pillars go sags and falls piece by piece, out to the next pillars', () => {
    const w = bench({ venue: 'venue.knotwood' });
    const deck = w.statics.filter((s) => s.link !== undefined);
    const legs = w.statics.filter((s) => s.holds !== undefined);
    // a pair of pillars with pillars on both sides of it
    const held = [...new Set(legs.map((s) => s.holds!))].sort((a, b) => a - b);
    const at = held[1]!;
    const pair = legs.filter((s) => s.holds === at);
    expect(pair.length).toBe(2);
    // one of a pair is not enough to hold it
    fall(w, pair[0]!, pair[0]!.x, pair[0]!.y);
    const doomed = deck.filter((s) => s.sagT !== undefined).map((s) => s.link!);
    expect(doomed).toEqual(
      deck.filter((s) => s.link! > held[0]! + 1 && s.link! < held[2]! - 1).map((s) => s.link),
    );
    expect(deck.some((s) => s.down)).toBe(false);
    let most = 0;
    let last = 0;
    runUntil(
      w,
      () => {
        const n = deck.filter((s) => s.down).length;
        most = Math.max(most, n - last);
        last = n;
        return w.sagging.length === 0;
      },
      60 * 3,
    );
    expect(last).toBe(doomed.length);
    // it ran out along the deck from the break: never more than a piece each way in one step
    expect(most).toBeLessThanOrEqual(2);
    // and all of it is built again, on its pillars
    runUntil(w, () => w.mending.length === 0, 60 * 30);
    expect(deck.every((s) => !s.down)).toBe(true);
    expect(pair.every((s) => !s.down)).toBe(true);
    expect(w.sagging.length).toBe(0);
  });

  it('the ramps lie on the ground: a hole in one takes nothing else with it', () => {
    const w = bench({ venue: 'venue.knotwood' });
    const low = w.statics.filter((s) => s.rests);
    expect(low.length).toBeGreaterThan(8);
    const hit = low[3]!;
    fall(w, hit, hit.x, hit.y);
    expect(w.sagging.length).toBe(0);
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
