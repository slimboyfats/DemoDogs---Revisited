import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.bollard', () => {
  it('is cast iron: a ram does not move it', () => {
    const r = propTest('prop.bollard', 120);
    expect(r.blocked).toBe(true);
    expect(r.piece!.down).toBeFalsy();
  });
});
