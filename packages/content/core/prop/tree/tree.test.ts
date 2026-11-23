import { describe, expect, it } from 'vitest';
import { explode } from '@demodogs/sim';
import { propTest, runUntil } from '../../../src/testing';

describe('prop.tree', () => {
  it('is solid: a car driving into it bounces off, and the knock shakes leaves loose', () => {
    const r = propTest('prop.tree', 120);
    expect(r.blocked).toBe(true);
    expect(r.events).toContain('strip');
    expect(r.piece!.leaves).toBeLessThan(1);
  });

  it('a blast beyond its crater tears leaves off and leaves the wood alone', () => {
    const r = propTest('prop.tree', 5);
    const w = r.world;
    const s = r.piece!;
    explode(w, s.x + 70, s.y, 1, null);
    expect(s.hp).toBe(s.def.integrity);
    expect(s.leaves).toBeLessThan(0.85);
    expect(s.leaves).toBeGreaterThan(0.4);
  });

  it('the nearer the blast the barer the tree', () => {
    const left = (d: number) => {
      const r = propTest('prop.tree', 5);
      explode(r.world, r.piece!.x + d, r.piece!.y, 1, null);
      return r.piece!.leaves!;
    };
    expect(left(50)).toBeLessThan(left(90));
    expect(left(140)).toBe(1);
  });

  it('fire eats the crown before the tree comes down', () => {
    const r = propTest('prop.tree', 5);
    const w = r.world;
    const s = r.piece!;
    w.blazes.push({ x: s.x, y: s.y, r: 9, t: 20, bite: 0, owner: -1 });
    runUntil(w, () => s.leaves === 0 || s.down === true, 60 * 20);
    expect(s.leaves).toBe(0);
    runUntil(w, () => s.down === true, 60 * 20);
    expect(s.down).toBe(true);
  });
});
