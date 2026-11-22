import { describe, expect, it } from 'vitest';
import { NO_CONTROLS } from '@demodogs/shared';
import { loadContent } from '../../../src/index';
import { bench, openSpot, put } from '../../../src/testing';

describe('weapon.rocket', () => {
  it('flies ahead and blows up on the car in front, crediting the shooter', () => {
    const w = bench({ rivals: 1 });
    w.bots.length = 0;
    const [x, y] = openSpot(w, 80);
    const me = w.player;
    const them = w.cars.find((c) => c !== me)!;
    put(me, x - 40, y, 0);
    put(them, x + 40, y, 0);
    them.ai = null;
    me.weapon = loadContent().weapon.get('weapon.rocket')!;
    me.ammo = 3;
    w.step({ ...NO_CONTROLS, fire: true });
    expect(w.rockets.length).toBe(1);
    expect(me.ammo).toBe(2);
    for (let i = 0; i < 60 && w.rockets.length; i++) w.step();
    expect(w.rockets.length).toBe(0);
    expect(them.hp).toBeLessThan(100);
    expect(me.score).toBeGreaterThan(0);
  });
});
