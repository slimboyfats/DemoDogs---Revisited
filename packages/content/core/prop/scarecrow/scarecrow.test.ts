import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.scarecrow', () => {
  it('is knocked to bits by a car, which drives on', () => {
    const r = propTest('prop.scarecrow', 150);
    expect(r.piece!.down).toBe(true);
    expect(r.blocked).toBe(false);
  });
});
