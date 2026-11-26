import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.castle-arch', () => {
  it('stands overhead: a car drives straight under it', () => {
    const r = propTest('prop.castle-arch', 120);
    expect(r.blocked).toBe(false);
    expect(r.piece!.down).toBeFalsy();
  });
});
