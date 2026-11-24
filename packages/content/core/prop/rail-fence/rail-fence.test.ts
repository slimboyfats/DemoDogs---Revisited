import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.rail-fence', () => {
  it('stops a slow car, splinters under a fast one', () => {
    expect(propTest('prop.rail-fence', 45).blocked).toBe(true);
    const r = propTest('prop.rail-fence', 170);
    expect(r.piece!.down).toBe(true);
    expect(r.blocked).toBe(false);
  });
});
