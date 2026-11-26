import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.stalagmite', () => {
  it('is solid: a car driving into it bounces off', () => {
    expect(propTest('prop.stalagmite', 120).blocked).toBe(true);
  });
});
