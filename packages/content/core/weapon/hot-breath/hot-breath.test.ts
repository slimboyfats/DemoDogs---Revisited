import { describe, expect, it } from 'vitest';
import { NO_CONTROLS } from '@demodogs/shared';
import { spill } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { flatBench, put } from '../../../src/testing';

const C = loadContent();

describe('weapon.hot-breath', () => {
  it('scalds the car in front and lights the slick under it', () => {
    const w = flatBench({ rivals: 1 });
    const [x, y] = [w.oval!.cx, w.oval!.cy];
    const me = w.player;
    const them = w.cars.find((c) => c !== me)!;
    them.ai = null;
    put(me, x - 30, y, 0);
    put(them, x + 20, y, 0);
    spill(w, C.material.get('material.oil')!, x + 10, y, 10, -1);
    me.weapon = C.weapon.get('weapon.hot-breath')!;
    me.ammo = 4;
    w.step({ ...NO_CONTROLS, fire: true });
    expect(me.ammo).toBe(3);
    expect(w.arms.sprays.length).toBe(1);
    const events: string[] = [];
    for (let i = 0; i < 70; i++) {
      w.step();
      for (const e of w.takeEvents()) events.push(e.t);
    }
    expect(them.hp).toBeLessThan(85);
    expect(me.score).toBeGreaterThan(0);
    expect(events).toContain('splash');
    expect(events).toContain('blaze');
    expect(w.spills.some((s) => s.def.id === 'material.oil')).toBe(false);
  });

  it('sets a fuel drum it licks burning', () => {
    const w = flatBench();
    const [x, y] = [w.oval!.cx, w.oval!.cy];
    const me = w.player;
    put(me, x - 30, y, 0);
    w.props.push({
      index: 0,
      def: C.prop.get('prop.barrel')!,
      x: x + 15,
      y,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      rot: 0,
      spin: 0,
      alive: true,
      fuse: 0,
      owner: -1,
    });
    me.weapon = C.weapon.get('weapon.hot-breath')!;
    me.ammo = 1;
    w.step({ ...NO_CONTROLS, fire: true });
    expect(me.weapon).toBe(null);
    let lit = false;
    for (let i = 0; i < 40 && !lit; i++) {
      w.step();
      lit = w.props[0]!.fuse > 0 || !w.props[0]!.alive;
    }
    expect(lit).toBe(true);
  });
});
