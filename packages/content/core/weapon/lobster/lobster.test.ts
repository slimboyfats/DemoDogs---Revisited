import { describe, expect, it } from 'vitest';
import { NO_CONTROLS } from '@demodogs/shared';
import { stand } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { flatBench, put } from '../../../src/testing';

const C = loadContent();

describe('weapon.lobster', () => {
  it('goes over a wall and digs a deep crater by the car behind it', () => {
    const w = flatBench({ rivals: 1 });
    const [x, y] = [w.oval!.cx, w.oval!.cy];
    const me = w.player;
    const them = w.cars.find((c) => c !== me)!;
    them.ai = null;
    put(me, x - 90, y, 0);
    const wall = [-1, 0, 1].map((k) =>
      stand(w, C.prop.get('prop.concrete-wall')!, x - 40, y + k * 8.5, 0, 0),
    );
    put(them, x + 60, y, 0);
    me.weapon = C.weapon.get('weapon.lobster')!;
    me.ammo = 2;
    w.step({ ...NO_CONTROLS, fire: true });
    for (let i = 0; i < 120 && w.arms.shells.length; i++) w.step();
    expect(w.arms.shells.length).toBe(0);
    expect(wall.every((s) => !s.down)).toBe(true);
    const pit = w.craters[w.craters.length - 1]!;
    expect(Math.hypot(pit.x - (x + 60), pit.y - y)).toBeLessThan(25);
    expect(pit.r).toBeGreaterThan(6);
    expect(them.hp).toBeLessThan(90);
    // a plain bomb: no fuel thrown about
    expect(w.spills.length).toBe(0);
  });
});
