import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.bush', () => {
  it('a car goes through it and it bursts into leaves', () => {
    const r = propTest('prop.bush', 120);
    expect(r.blocked).toBe(false);
    expect(r.piece!.down).toBe(true);
  });
});
