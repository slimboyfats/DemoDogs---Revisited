import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.pond', () => {
  it('is only to look at: a car drives straight over it', () => {
    expect(propTest('prop.pond', 120).blocked).toBe(false);
  });
});
