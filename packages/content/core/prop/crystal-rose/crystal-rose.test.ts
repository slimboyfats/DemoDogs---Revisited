import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';
import look from './look';

describe('prop.crystal-rose', () => {
  it('stops a car', () => {
    expect(propTest('prop.crystal-rose', 50).blocked).toBe(true);
  });
  it('is made of a material that gives light', () => {
    const L = look.look;
    if (L.kind !== 'prop') throw new Error('not a prop');
    expect(L.part.fn(0, 0, 6)).toMatch(/glow/);
  });
});
