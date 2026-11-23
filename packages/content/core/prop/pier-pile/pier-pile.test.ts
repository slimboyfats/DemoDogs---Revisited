import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.pier-pile', () => {
  it('stops a slow car and snaps under a fast one', () => {
    expect(propTest('prop.pier-pile', 30).blocked).toBe(true);
    expect(propTest('prop.pier-pile', 170).piece!.down).toBe(true);
  });
});
