import { describe, expect, it } from 'vitest';
import { NO_CONTROLS } from '@demodogs/shared';
import { makeWorld, put, runUntil, startRace } from '../../../src/testing';

describe('bot.scrap', () => {
  it('is flattened by a fast car: points and boost for the driver', () => {
    const w = startRace(makeWorld({ rivals: 0 }));
    const b = w.bots[0]!;
    const c = w.player;
    c.nitro = 0.5;
    put(c, b.x - 30, b.y, 0, 120);
    runUntil(w, () => !b.alive, 30);
    w.step({ ...NO_CONTROLS });
    expect(b.alive).toBe(false);
    expect(c.score).toBeGreaterThanOrEqual(100);
    expect(c.smashed).toBe(1);
    expect(c.nitro).toBeGreaterThan(0.5);
  });

  it('walks about and comes back after being smashed', () => {
    const w = startRace(makeWorld({ rivals: 0 }));
    const b = w.bots[0]!;
    const x0 = b.x;
    runUntil(w, () => false, 60);
    expect(b.x).not.toBe(x0);
    b.alive = false;
    b.deadT = 0.1;
    runUntil(w, () => b.alive, 30);
    expect(b.alive).toBe(true);
  });
});
