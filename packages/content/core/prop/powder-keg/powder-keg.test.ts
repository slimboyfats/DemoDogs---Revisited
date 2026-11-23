import { describe, expect, it } from 'vitest';
import { explode } from '@demodogs/sim';
import { propTest } from '../../../src/testing';

describe('prop.powder-keg', () => {
  it('goes off when a car hits it at speed', () => {
    const r = propTest('prop.powder-keg', 120);
    expect(r.prop.alive).toBe(false);
    expect(r.events).toContain('explode');
  });

  it('a blast sets it off and it throws sparks', () => {
    const r = propTest('prop.powder-keg', 5);
    const w = r.world;
    const p = w.props[0]!;
    w.takeEvents();
    explode(w, p.x + 24, p.y, 1, null);
    const seen: string[] = [];
    for (let i = 0; i < 300; i++) {
      w.step();
      for (const e of w.takeEvents()) seen.push(e.t);
    }
    expect(p.alive).toBe(false);
    expect(seen.filter((t) => t === 'pop').length).toBeGreaterThan(6);
  });
});
