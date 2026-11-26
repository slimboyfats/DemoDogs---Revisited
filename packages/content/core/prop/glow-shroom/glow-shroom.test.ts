import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.glow-shroom', () => {
  it('is solid at the stalk: a car bounces off', () => {
    expect(propTest('prop.glow-shroom', 100).blocked).toBe(true);
  });
});
