import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.water-butt', () => {
  it('floods the ground when it bursts, and puts out a fire', () => {
    const r = propTest('prop.water-butt', 40);
    const w = r.world;
    const p = w.props[0]!;
    w.blazes.push({ x: p.x + 6, y: p.y, r: 9, t: 30, bite: 5, owner: -1 });
    const c = w.player;
    c.x = p.x - 40;
    c.vx = 200;
    for (let i = 0; i < 60; i++) w.step();
    expect(p.alive).toBe(false);
    expect(w.spills.length).toBe(5);
    expect(w.blazes.length).toBe(0);
  });
});
