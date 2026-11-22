import { describe, expect, it } from 'vitest';
import { NO_CONTROLS } from '@demodogs/shared';
import { loadContent } from '../../../src/index';
import { bench, openSpot, put } from '../../../src/testing';

describe('weapon.oil-can', () => {
  it('pours a slick out behind the car', () => {
    const w = bench();
    const [x, y] = openSpot(w, 80);
    const me = w.player;
    put(me, x, y, 0);
    me.weapon = loadContent().weapon.get('weapon.oil-can')!;
    me.ammo = 1;
    w.step({ ...NO_CONTROLS, fire: true });
    expect(w.spills.length).toBe(1);
    expect(w.spills[0]!.x).toBeLessThan(me.x);
    expect(me.weapon).toBe(null);
  });
});
