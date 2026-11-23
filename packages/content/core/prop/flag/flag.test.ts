import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.flag', () => {
  it('is snapped off by a car, which drives on', () => {
    const r = propTest('prop.flag', 150);
    expect(r.piece!.down).toBe(true);
    expect(r.blocked).toBe(false);
  });
});
