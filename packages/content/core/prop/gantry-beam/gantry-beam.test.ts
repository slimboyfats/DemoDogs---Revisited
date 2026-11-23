import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.gantry-beam', () => {
  it('stands overhead: a car drives straight under it', () => {
    const r = propTest('prop.gantry-beam', 120);
    expect(r.blocked).toBe(false);
    expect(r.piece!.down).toBeFalsy();
  });
});
