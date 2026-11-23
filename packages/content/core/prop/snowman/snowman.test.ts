import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.snowman', () => {
  it('comes apart when a car drives through it', () => {
    const r = propTest('prop.snowman', 150);
    expect(r.piece!.down).toBe(true);
    expect(r.blocked).toBe(false);
  });
});
