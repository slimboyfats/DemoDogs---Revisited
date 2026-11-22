import { describe, expect, it } from 'vitest';
import { makeWorld, runUntil, startRace } from '../../../src/testing';

describe('mode.derby', () => {
  it('a wrecked car stays wrecked, and the player being wrecked ends the derby', () => {
    const w = startRace(makeWorld({ venue: 'venue.the-pit', rivals: 2 }));
    const r = w.cars[1]!;
    r.hp = 0;
    r.wrecked = true;
    runUntil(w, () => false, 60 * 5);
    expect(r.wrecked).toBe(true);
    w.player.wrecked = true;
    runUntil(w, (w) => w.phase === 'over', 60 * 5);
    expect(w.phase).toBe('over');
  });

  it('ends when time runs out', () => {
    const w = startRace(makeWorld({ venue: 'venue.the-pit', rivals: 1 }));
    w.timeLeft = 0.5;
    runUntil(w, (w) => w.phase === 'over', 60 * 5);
    expect(w.phase).toBe('over');
  });
});
