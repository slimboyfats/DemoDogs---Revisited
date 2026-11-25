import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.park-bench', () => {
  it('breaks under a fast car', () => {
    const r = propTest('prop.park-bench', 170);
    expect(r.piece!.down).toBe(true);
    expect(r.blocked).toBe(false);
  });
});
