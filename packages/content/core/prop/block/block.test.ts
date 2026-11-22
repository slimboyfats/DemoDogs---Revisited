import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.block', () => {
  it('is for looks only: a car drives through it', () => {
    const r = propTest('prop.block', 120);
    expect(r.blocked).toBe(false);
  });
});
