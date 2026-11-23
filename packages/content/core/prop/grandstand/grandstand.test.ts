import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.grandstand', () => {
  it('stops a car, and loses planks to it', () => {
    const r = propTest('prop.grandstand', 150);
    expect(r.blocked).toBe(true);
    expect(r.events).toContain('chip');
  });
});
