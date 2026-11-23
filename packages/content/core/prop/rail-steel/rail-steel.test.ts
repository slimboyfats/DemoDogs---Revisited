import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.rail-steel', () => {
  it('turns a car away at speed', () => {
    const r = propTest('prop.rail-steel', 110);
    expect(r.blocked).toBe(true);
    expect(r.piece!.down).toBeUndefined();
  });
});
