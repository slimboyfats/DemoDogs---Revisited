import { describe, expect, it } from 'vitest';
import { NO_CONTROLS } from '@demodogs/shared';
import { stand } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { flatBench, put } from '../../../src/testing';

const C = loadContent();

describe('weapon.bowler', () => {
  it('ploughs through a fence and bowls into the car beyond', () => {
    const w = flatBench({ rivals: 1 });
    const [x, y] = [w.oval!.cx, w.oval!.cy];
    const me = w.player;
    const them = w.cars.find((c) => c !== me)!;
    them.ai = null;
    put(me, x - 60, y, 0);
    const fence = stand(w, C.prop.get('prop.plank-fence')!, x, y, 0, 0);
    put(them, x + 50, y, 0);
    me.weapon = C.weapon.get('weapon.bowler')!;
    me.ammo = 2;
    w.step({ ...NO_CONTROLS, fire: true });
    expect(w.arms.balls.length).toBe(1);
    for (let i = 0; i < 60; i++) w.step();
    expect(fence.down).toBe(true);
    expect(them.hp).toBeLessThan(100);
    expect(them.x).toBeGreaterThan(x + 52);
  });

  it('glances off concrete and rolls to a stop in the end', () => {
    const w = flatBench();
    const [x, y] = [w.oval!.cx, w.oval!.cy];
    const me = w.player;
    put(me, x - 60, y, 0);
    const wall = stand(w, C.prop.get('prop.concrete-wall')!, x, y, 0, 0);
    me.weapon = C.weapon.get('weapon.bowler')!;
    me.ammo = 2;
    w.step({ ...NO_CONTROLS, fire: true });
    const b = w.arms.balls[0]!;
    for (let i = 0; i < 40; i++) w.step();
    expect(wall.down).toBeFalsy();
    expect(b.vx).toBeLessThan(0);
    for (let i = 0; i < 600 && w.arms.balls.length; i++) w.step();
    expect(w.arms.balls.length).toBe(0);
  });
});
