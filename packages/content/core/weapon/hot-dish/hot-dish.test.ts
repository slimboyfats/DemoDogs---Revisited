import { describe, expect, it } from 'vitest';
import { NO_CONTROLS } from '@demodogs/shared';
import { rangeArms } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { flatBench, put } from '../../../src/testing';

describe('weapon.hot-dish', () => {
  it('lobs onto the car ahead: a crater and a ring of fire', () => {
    const w = flatBench({ rivals: 1 });
    const [x, y] = [w.oval!.cx, w.oval!.cy];
    const me = w.player;
    const them = w.cars.find((c) => c !== me)!;
    them.ai = null;
    put(me, x - 80, y, 0);
    put(them, x + 80, y, 0);
    me.weapon = loadContent().weapon.get('weapon.hot-dish')!;
    me.ammo = 2;
    w.step({ ...NO_CONTROLS, fire: true });
    expect(w.arms.shells.length).toBe(1);
    let top = 0;
    for (let i = 0; i < 90 && w.arms.shells.length; i++) {
      w.step();
      top = Math.max(top, w.arms.shells[0]?.z ?? 0);
    }
    expect(top).toBeGreaterThan(40);
    expect(w.arms.shells.length).toBe(0);
    expect(w.craters.length).toBeGreaterThan(0);
    expect(w.blazes.length).toBeGreaterThan(3);
    expect(them.hp).toBeLessThan(100);
  });
});

describe('weapon.hot-dish on the test range', () => {
  it('lands on the spot it is aimed at', () => {
    const w = flatBench();
    const [x, y] = [w.oval!.cx, w.oval!.cy];
    put(w.player, x, y, 0);
    rangeArms(w, loadContent().weapon.get('weapon.hot-dish')!, w.player, x, y + 120);
    expect(Math.abs(w.player.h - Math.PI / 2)).toBeLessThan(1e-9);
    for (let i = 0; i < 120 && w.arms.shells.length; i++) w.step();
    const pit = w.craters[w.craters.length - 1]!;
    expect(Math.hypot(pit.x - x, pit.y - (y + 120))).toBeLessThan(12);
  });
});
