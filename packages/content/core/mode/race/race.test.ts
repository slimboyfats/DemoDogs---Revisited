import { describe, expect, it } from 'vitest';
import { makeWorld, runUntil, startRace } from '../../../src/testing';

describe('mode.race', () => {
  it('tows a wrecked car back to the road after a short wait, repaired', () => {
    const w = startRace(makeWorld({ rivals: 1 }));
    w.player.hp = 1;
    w.step();
    const c = w.player;
    c.hp = 0;
    c.wrecked = true;
    c.wreckT = 0;
    runUntil(w, (w) => !w.player.wrecked, 60 * 5);
    expect(c.wrecked).toBe(false);
    expect(c.hp).toBe(100);
    expect(w.offroad(c.x, c.y)).toBe(false);
  });

  it('counts laps across the line, and not backwards', () => {
    const w = startRace(makeWorld({ rivals: 0 }));
    const c = w.player;
    const T = w.track!;
    const lap0 = c.lap;
    for (let i = T.n - 30; i < T.n + 30; i += 4) {
      c.x = T.x[i % T.n]!;
      c.y = T.y[i % T.n]!;
      w.step();
    }
    expect(c.lap).toBe(lap0 + 1);
    for (let i = T.n + 30; i > T.n - 30; i -= 4) {
      c.x = T.x[i % T.n]!;
      c.y = T.y[i % T.n]!;
      w.step();
    }
    expect(c.lap).toBe(lap0);
  });
});
