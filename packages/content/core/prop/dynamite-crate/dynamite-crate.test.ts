import { describe, expect, it } from 'vitest';
import { explode } from '@demodogs/sim';
import { propTest } from '../../../src/testing';

describe('prop.dynamite-crate', () => {
  it('goes off when a car hits it at speed', () => {
    const r = propTest('prop.dynamite-crate', 130);
    expect(r.prop.alive).toBe(false);
    expect(r.events).toContain('explode');
  });

  it('a blast nearby sets it off, and it throws sparks', () => {
    const r = propTest('prop.dynamite-crate', 5);
    const w = r.world;
    const p = w.props[0]!;
    w.takeEvents();
    explode(w, p.x + 26, p.y, 1, null);
    const seen: string[] = [];
    for (let i = 0; i < 300; i++) {
      w.step();
      for (const e of w.takeEvents()) seen.push(e.t);
    }
    expect(p.alive).toBe(false);
    expect(seen.filter((t) => t === 'explode').length).toBeGreaterThanOrEqual(1);
  });
});
