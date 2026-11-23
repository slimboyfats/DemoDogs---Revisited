import { describe, expect, it } from 'vitest';
import { NO_CONTROLS } from '@demodogs/shared';
import { loadContent } from '../../../src/index';
import { flatBench, put } from '../../../src/testing';

const tick = () => loadContent().weapon.get('weapon.tick')!;

describe('weapon.tick', () => {
  it('clings to the car it strikes, is handed on by a touch, and blows on the last one', () => {
    const w = flatBench({ rivals: 2 });
    const [x, y] = [w.oval!.cx, w.oval!.cy];
    const me = w.player;
    const [a, b] = w.cars.filter((c) => c !== me);
    a!.ai = b!.ai = null;
    put(me, x - 40, y, 0);
    put(a!, x + 10, y, 0);
    put(b!, x + 10, y + 120, 0);
    me.weapon = tick();
    me.ammo = 1;
    w.step({ ...NO_CONTROLS, fire: true });
    for (let i = 0; i < 20 && w.arms.stickies[0]!.flying; i++) w.step();
    const s = w.arms.stickies[0]!;
    expect(s.car).toBe(a!.index);
    // a rams b: the bomb is b's now, and a gets the credit for it
    put(b!, a!.x, a!.y + 13, 0);
    const events: string[] = [];
    w.step();
    for (const e of w.takeEvents()) events.push(e.t);
    expect(events).toContain('pass');
    expect(s.car).toBe(b!.index);
    expect(s.owner).toBe(a!.index);
    put(b!, x + 10, y + 120, 0);
    for (let i = 0; i < 240 && w.arms.stickies.length; i++) w.step();
    expect(w.arms.stickies.length).toBe(0);
    expect(b!.hp).toBeLessThan(80);
    expect(a!.score).toBeGreaterThan(0);
  });

  it('lies ticking where it lands and the first car over it takes it', () => {
    const w = flatBench({ rivals: 1 });
    const [x, y] = [w.oval!.cx, w.oval!.cy];
    const me = w.player;
    const them = w.cars.find((c) => c !== me)!;
    them.ai = null;
    put(me, x - 100, y, 0);
    put(them, x + 200, y + 200, 0);
    me.weapon = tick();
    me.ammo = 1;
    w.step({ ...NO_CONTROLS, fire: true });
    for (let i = 0; i < 70 && w.arms.stickies[0]!.flying; i++) w.step();
    const s = w.arms.stickies[0]!;
    expect(s.flying).toBe(false);
    expect(s.car).toBe(-1);
    for (let i = 0; i < 30; i++) w.step();
    put(them, s.x, s.y, 0);
    w.step();
    expect(s.car).toBe(them.index);
  });
});
