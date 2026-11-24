import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.daisies', () => {
  it('is only to look at: a car drives straight over them', () => {
    expect(propTest('prop.daisies', 120).blocked).toBe(false);
  });
});
