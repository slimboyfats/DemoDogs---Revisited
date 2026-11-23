import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.oil-drum', () => {
  it('spills a slick when it is broken open', () => {
    const r = propTest('prop.oil-drum', 150);
    expect(r.prop.alive).toBe(false);
    expect(r.events.filter((t) => t === 'spill').length).toBe(3);
    expect(r.world.spills.every((s) => s.def.id === 'material.oil')).toBe(true);
  });

  it('stands a gentle shove', () => {
    const r = propTest('prop.oil-drum', 40);
    expect(r.prop.alive).toBe(true);
    expect(r.world.spills.length).toBe(0);
  });
});
