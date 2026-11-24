import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.ball-launcher', () => {
  it('stops a car dead and stands', () => {
    const r = propTest('prop.ball-launcher', 170);
    expect(r.blocked).toBe(true);
    expect(r.piece!.down).toBeFalsy();
  });
});
