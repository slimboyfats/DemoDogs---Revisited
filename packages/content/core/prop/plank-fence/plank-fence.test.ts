import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.plank-fence', () => {
  it('stops a slow car, splinters under a fast one', () => {
    expect(propTest('prop.plank-fence', 45).blocked).toBe(true);
    const r = propTest('prop.plank-fence', 170);
    expect(r.piece!.down).toBe(true);
    expect(r.blocked).toBe(false);
  });
});
