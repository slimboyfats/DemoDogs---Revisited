import { describe, expect, it } from 'vitest';
import { NO_CONTROLS } from '@demodogs/shared';
import { loadContent } from '../../../src/index';
import { bench, openSpot, put } from '../../../src/testing';

describe('weapon.mine', () => {
  it('drops behind, arms, and throws the car that drives over it', () => {
    const w = bench({ rivals: 1 });
    const [x, y] = openSpot(w, 80);
    const me = w.player;
    const them = w.cars.find((c) => c !== me)!;
    them.ai = null;
    put(me, x, y, 0);
    put(them, x + 200, y + 200, 0);
    me.weapon = loadContent().weapon.get('weapon.mine')!;
    me.ammo = 1;
    w.step({ ...NO_CONTROLS, fire: true });
    expect(w.mines.length).toBe(1);
    expect(me.weapon).toBe(null);
    const m = w.mines[0]!;
    for (let i = 0; i < 60; i++) w.step();
    put(them, m.x, m.y, 0);
    w.step();
    expect(w.mines.length).toBe(0);
    expect(them.hp).toBeLessThan(100);
    expect(them.vz).toBeGreaterThan(0);
  });
});
