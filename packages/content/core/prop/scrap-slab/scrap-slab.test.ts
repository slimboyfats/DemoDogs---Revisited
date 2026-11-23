import { describe, expect, it } from 'vitest';
import { flatBench, propTest, put } from '../../../src/testing';
import { loadContent } from '../../../src/index';

describe('prop.scrap-slab', () => {
  it('is heavy: a car shoves it only a little way', () => {
    const r = propTest('prop.scrap-slab', 80);
    expect(r.prop.alive).toBe(true);
    expect(r.prop.x - r.start).toBeLessThan(30);
  });

  it('hurts a car it lands on', () => {
    const w = flatBench();
    const c = w.player;
    put(c, w.oval!.cx, w.oval!.cy, 0);
    const hp = c.hp;
    w.props.push({
      index: w.props.length,
      def: loadContent().prop.get('prop.scrap-slab')!,
      x: c.x,
      y: c.y,
      z: 30,
      vx: 0,
      vy: 0,
      vz: -40,
      rot: 0,
      spin: 0,
      alive: true,
      fuse: 0,
      owner: -1,
    });
    for (let i = 0; i < 60; i++) w.step();
    expect(c.hp).toBeLessThan(hp - 15);
  });
});
