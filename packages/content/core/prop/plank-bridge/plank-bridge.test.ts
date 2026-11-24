import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.plank-bridge', () => {
  it('is driven straight over', () => {
    expect(propTest('prop.plank-bridge', 120).blocked).toBe(false);
  });
});
