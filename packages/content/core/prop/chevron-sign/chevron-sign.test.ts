import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.chevron-sign', () => {
  it('is flattened by a car at speed', () => {
    const r = propTest('prop.chevron-sign', 150);
    expect(r.piece!.down).toBe(true);
    expect(r.blocked).toBe(false);
  });
});
