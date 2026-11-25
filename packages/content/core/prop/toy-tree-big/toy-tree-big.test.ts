import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.toy-tree-big', () => {
  it('stops a car dead and stands', () => {
    const r = propTest('prop.toy-tree-big', 170);
    expect(r.blocked).toBe(true);
    expect(r.piece!.down).toBeFalsy();
  });
});
