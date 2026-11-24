import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.park-dog', () => {
  it('is only to look at: a car is not stopped by it', () => {
    expect(propTest('prop.park-dog', 120).blocked).toBe(false);
  });
});
