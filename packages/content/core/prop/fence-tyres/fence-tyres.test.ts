import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.fence-tyres', () => {
  it('is for looks only: a car drives through it', () => {
    const r = propTest('prop.fence-tyres', 120);
    expect(r.blocked).toBe(false);
  });
});
