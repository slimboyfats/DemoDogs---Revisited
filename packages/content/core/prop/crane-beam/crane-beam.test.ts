import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.crane-beam', () => {
  it('is overhead: cars drive under it', () => {
    const r = propTest('prop.crane-beam', 60);
    expect(r.blocked).toBe(false);
    expect(r.piece!.down).toBeFalsy();
  });
});
