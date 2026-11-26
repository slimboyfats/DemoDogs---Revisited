import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.lava-rock', () => {
  it('is solid: a car driving into it bounces off', () => {
    expect(propTest('prop.lava-rock', 120).blocked).toBe(true);
  });
});
