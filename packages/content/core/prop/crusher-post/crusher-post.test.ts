import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.crusher-post', () => {
  it('is solid and stands a hard ram', () => {
    const r = propTest('prop.crusher-post', 160);
    expect(r.blocked).toBe(true);
    expect(r.piece!.down).toBeFalsy();
  });
});
