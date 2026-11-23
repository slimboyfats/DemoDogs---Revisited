import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.sky-scrap', () => {
  it('is in the way: a car at racing speed bounces off it', () => {
    const r = propTest('prop.sky-scrap', 80);
    expect(r.blocked).toBe(true);
    expect(r.piece!.down).toBeFalsy();
  });

  it('can be broken: rammed flat out again and again, it comes apart', () => {
    const r = propTest('prop.sky-scrap', 80);
    expect(r.piece!.hp).toBeLessThan(55);
  });
});
