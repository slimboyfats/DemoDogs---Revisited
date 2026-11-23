import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.lamppost', () => {
  it('folds when a car hits it at speed', () => {
    const r = propTest('prop.lamppost', 110);
    expect(r.piece!.down).toBe(true);
  });
});
