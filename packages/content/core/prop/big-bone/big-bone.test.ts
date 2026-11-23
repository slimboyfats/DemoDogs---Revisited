import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.big-bone', () => {
  it('splinters when a car hits it at speed', () => {
    const r = propTest('prop.big-bone', 140);
    expect(r.prop.alive).toBe(false);
    expect(r.events).toContain('break');
  });

  it('is shoved along by a slow car', () => {
    const r = propTest('prop.big-bone', 35);
    expect(r.prop.alive).toBe(true);
    expect(r.prop.x).toBeGreaterThan(r.start);
  });
});
