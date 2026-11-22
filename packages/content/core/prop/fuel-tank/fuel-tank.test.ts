import { describe, expect, it } from 'vitest';
import { explode } from '@demodogs/sim';
import { propTest } from '../../../src/testing';

describe('prop.fuel-tank', () => {
  it('is too heavy to shove far and shrugs off a bump', () => {
    const r = propTest('prop.fuel-tank', 60);
    expect(r.prop.alive).toBe(true);
    expect(r.prop.x - r.start).toBeLessThan(12);
  });

  it('caught in a blast it leaks, goes up, and throws fire and blazing drums', () => {
    const r = propTest('prop.fuel-tank', 20);
    const w = r.world;
    const p = w.props[0]!;
    w.takeEvents();
    explode(w, p.x + 30, p.y, 1, null);
    const seen: string[] = [];
    for (let i = 0; i < 400; i++) {
      w.step();
      for (const e of w.takeEvents()) seen.push(e.t);
    }
    expect(p.alive).toBe(false);
    expect(seen.filter((t) => t === 'spill').length).toBe(6);
    expect(seen.filter((t) => t === 'launch').length).toBe(0);
    expect(seen.filter((t) => t === 'airburst').length).toBe(3);
    expect(seen.filter((t) => t === 'blaze').length).toBeGreaterThan(8);
    expect(w.props.length).toBe(4);
  });
});
