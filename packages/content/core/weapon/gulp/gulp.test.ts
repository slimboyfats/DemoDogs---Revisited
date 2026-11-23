import { describe, expect, it } from 'vitest';
import { NO_CONTROLS } from '@demodogs/shared';
import { loadContent } from '../../../src/index';
import { flatBench, put } from '../../../src/testing';

const C = loadContent();

describe('weapon.gulp', () => {
  it('anchors, drags cars and drums into a knot, then bursts among them', () => {
    const w = flatBench({ rivals: 2 });
    const [x, y] = [w.oval!.cx, w.oval!.cy];
    const me = w.player;
    const [a, b] = w.cars.filter((c) => c !== me);
    a!.ai = b!.ai = null;
    put(me, x - 90, y, 0);
    put(a!, x + 40, y - 45, 0);
    put(b!, x + 40, y + 45, 0);
    w.props.push({
      index: 0,
      def: C.prop.get('prop.crate')!,
      x: x - 30,
      y: y + 40,
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
    me.weapon = C.weapon.get('weapon.gulp')!;
    me.ammo = 2;
    w.step({ ...NO_CONTROLS, fire: true });
    expect(w.arms.orbs.length).toBe(1);
    const events: string[] = [];
    for (let i = 0; i < 60; i++) {
      w.step();
      for (const e of w.takeEvents()) events.push(e.t);
    }
    expect(events).toContain('orb');
    const o = w.arms.orbs[0]!;
    const gap = (c: { x: number; y: number }) => Math.hypot(c.x - o.x, c.y - o.y);
    const before = [gap(a!), gap(b!), gap(w.props[0]!)];
    for (let i = 0; i < 60; i++) w.step();
    expect(gap(a!)).toBeLessThan(before[0]!);
    expect(gap(b!)).toBeLessThan(before[1]!);
    expect(gap(w.props[0]!)).toBeLessThan(before[2]!);
    for (let i = 0; i < 200 && w.arms.orbs.length; i++) {
      w.step();
      for (const e of w.takeEvents()) events.push(e.t);
    }
    expect(w.arms.orbs.length).toBe(0);
    expect(events).toContain('explode');
    expect(a!.hp).toBeLessThan(100);
    expect(b!.hp).toBeLessThan(100);
  });
});
