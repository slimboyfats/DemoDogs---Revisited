import { describe, expect, it } from 'vitest';
import { bench, openSpot, put } from '../../../src/testing';

describe('weapon.gun', () => {
  const duel = (dy = 0) => {
    const w = bench({ rivals: 1 });
    const [x, y] = openSpot(w, 80);
    const me = w.player;
    const them = w.cars.find((c) => c !== me)!;
    them.ai = null;
    them.rounds = 0;
    put(me, x - 35, y, 0);
    put(them, x + 35, y + dy, 0);
    return { w, me, them };
  };

  it('fires by itself at a car in the sights, spends rounds and hurts it', () => {
    const { w, me, them } = duel();
    const had = me.rounds;
    expect(had).toBe(50);
    const shots = [];
    for (let i = 0; i < 30; i++) {
      w.step();
      shots.push(...w.takeEvents().filter((e) => e.t === 'shot'));
    }
    expect(shots.length).toBeGreaterThan(2);
    expect(me.rounds).toBe(had - shots.length);
    expect(them.hp).toBeLessThan(100);
    expect(me.score).toBeGreaterThan(0);
  });

  it('holds its fire with nobody ahead, and stops when it is empty', () => {
    const { w, me } = duel(60);
    for (let i = 0; i < 30; i++) w.step();
    expect(me.rounds).toBe(50);
    const b = duel();
    b.me.rounds = 2;
    for (let i = 0; i < 60; i++) b.w.step();
    expect(b.me.rounds).toBe(0);
    expect(b.them.hp).toBeGreaterThan(95);
  });
});
