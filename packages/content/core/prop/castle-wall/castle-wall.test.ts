import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.castle-wall', () => {
  it('stops a car and stands', () => {
    const r = propTest('prop.castle-wall', 160);
    expect(r.blocked).toBe(true);
    expect(r.piece!.down).toBeFalsy();
  });
});
