import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.barrel', () => {
  it('gets shoved by a slow car', () => {
    const r = propTest('prop.barrel', 40);
    expect(r.prop.alive).toBe(true);
    expect(r.prop.x).toBeGreaterThan(r.start);
  });

  it('blows up when rammed hard, hurting the car', () => {
    const r = propTest('prop.barrel', 170);
    expect(r.prop.alive).toBe(false);
    expect(r.events).toContain('explode');
  });
});
