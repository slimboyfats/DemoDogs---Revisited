import { describe, expect, it } from 'vitest';
import { NO_CONTROLS } from '@demodogs/shared';
import { loadContent } from '../../../src/index';
import { flatBench, put } from '../../../src/testing';

const C = loadContent();

describe('weapon.hydrant', () => {
  it('shoves the car in front off its line without wrecking it', () => {
    const w = flatBench({ rivals: 1 });
    const [x, y] = [w.oval!.cx, w.oval!.cy];
    const me = w.player;
    const them = w.cars.find((c) => c !== me)!;
    them.ai = null;
    put(me, x - 60, y, 0);
    put(them, x, y, 0);
    me.weapon = C.weapon.get('weapon.hydrant')!;
    me.ammo = 4;
    w.step({ ...NO_CONTROLS, fire: true });
    let far = them.x;
    for (let i = 0; i < 40; i++) {
      w.step();
      far = Math.max(far, them.x);
    }
    expect(far - x).toBeGreaterThan(15);
    expect(them.hp).toBeGreaterThan(95);
  });

  it('puts out a fire and leaves the road wet', () => {
    const w = flatBench();
    const [x, y] = [w.oval!.cx, w.oval!.cy];
    const me = w.player;
    put(me, x - 70, y, 0);
    w.blazes.push({ x, y, r: 8, t: 6, bite: 0.3, owner: -1 });
    me.weapon = C.weapon.get('weapon.hydrant')!;
    me.ammo = 4;
    w.step({ ...NO_CONTROLS, fire: true });
    const events: string[] = [];
    for (let i = 0; i < 80; i++) {
      w.step();
      for (const e of w.takeEvents()) events.push(e.t);
    }
    expect(w.blazes.length).toBe(0);
    expect(events).toContain('quench');
    expect(w.spills.some((s) => s.def.id === 'material.water')).toBe(true);
  });
});
