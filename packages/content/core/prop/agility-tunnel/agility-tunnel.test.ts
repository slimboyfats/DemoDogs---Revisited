import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.agility-tunnel', () => {
  it('breaks under a fast car', () => {
    const r = propTest('prop.agility-tunnel', 170);
    expect(r.piece!.down).toBe(true);
    expect(r.blocked).toBe(false);
  });
});
