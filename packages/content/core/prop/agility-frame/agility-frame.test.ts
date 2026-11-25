import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.agility-frame', () => {
  it('breaks under a fast car', () => {
    const r = propTest('prop.agility-frame', 170);
    expect(r.piece!.down).toBe(true);
    expect(r.blocked).toBe(false);
  });
});
