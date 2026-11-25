import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.toy-tree', () => {
  it('stops a car', () => {
    expect(propTest('prop.toy-tree', 120).blocked).toBe(true);
  });
});
