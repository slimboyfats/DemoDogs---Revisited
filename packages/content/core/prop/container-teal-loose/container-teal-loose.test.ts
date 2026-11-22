import { describe, expect, it } from 'vitest';
import { explode } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { bench, propTest } from '../../../src/testing';

const def = loadContent().prop.get('prop.container-teal-loose')!;

describe('prop.container-teal-loose', () => {
  it('is too heavy to shove far', () => {
    const r = propTest('prop.container-teal-loose', 70);
    expect(r.prop.alive).toBe(true);
    expect(r.prop.x - r.start).toBeLessThan(10);
  });

  it('crushes a car it lands on', () => {
    const w = bench();
    const c = w.player;
    c.invuln = 0;
    const hp = c.hp;
    w.props.push({
      index: 0,
      def,
      x: c.x,
      y: c.y,
      z: 12,
      vx: 0,
      vy: 0,
      vz: -40,
      rot: 0,
      spin: 0,
      alive: true,
      fuse: 0,
      owner: -1,
    });
    for (let i = 0; i < 30; i++) w.step();
    expect(c.hp).toBeLessThan(hp - 10);
  });

  it('a blast breaks it open', () => {
    const r = propTest('prop.container-teal-loose', 0);
    explode(r.world, r.prop.x + 6, r.world.props[0]!.y, 1.2, null);
    expect(r.world.props[0]!.alive).toBe(false);
  });
});
