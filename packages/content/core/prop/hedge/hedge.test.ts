import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.hedge', () => {
  it('stops a slow car, and a fast one bursts through', () => {
    expect(propTest('prop.hedge', 45).blocked).toBe(true);
    const r = propTest('prop.hedge', 170);
    expect(r.piece!.down).toBe(true);
    expect(r.blocked).toBe(false);
  });
});
