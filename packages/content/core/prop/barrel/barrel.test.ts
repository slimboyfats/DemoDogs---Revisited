import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.barrel', () => {
  it('gets shoved by a slow car', () => {
    const r = propTest('prop.barrel', 40);
    expect(r.prop.alive).toBe(true);
    expect(r.prop.x).toBeGreaterThan(r.start);
  });

  it('bursts when rammed hard, rockets up and blows apart in the air', () => {
    const r = propTest('prop.barrel', 170);
    expect(r.prop.alive).toBe(false);
    expect(r.events).toContain('explode');
    expect(r.events.indexOf('launch')).toBeGreaterThan(-1);
    expect(r.events.indexOf('airburst')).toBeGreaterThan(r.events.indexOf('launch'));
    expect(r.maxZ).toBeGreaterThan(30);
  });

  it('rains burning stars and pools of fuel, and leaves nothing in the air', () => {
    const r = propTest('prop.barrel', 170);
    const w = r.world;
    const seen = [...r.events];
    for (let i = 0; i < 600; i++) {
      w.step();
      for (const e of w.takeEvents()) seen.push(e.t);
    }
    expect(seen.filter((t) => t === 'pop').length).toBe(6);
    expect(seen.filter((t) => t === 'blaze').length).toBe(3);
    expect(w.embers.length).toBe(0);
    expect(w.blazes.length).toBe(0);
  });

  it('a pool of fire sets off a drum standing in it, and burns a car', () => {
    const r = propTest('prop.barrel', 40);
    const w = r.world;
    const p = w.props[0]!;
    const c = w.player;
    c.vx = c.vy = 0;
    const hp = c.hp;
    w.blazes.push({ x: p.x, y: p.y, r: 9, t: 3, bite: 0, owner: -1 });
    w.blazes.push({ x: c.x, y: c.y, r: 9, t: 3, bite: 0, owner: -1 });
    const seen: string[] = [];
    for (let i = 0; i < 120; i++) {
      w.step();
      for (const e of w.takeEvents()) seen.push(e.t);
    }
    expect(seen).toContain('launch');
    expect(c.hp).toBeLessThan(hp);
  });
});
