import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.cactus', () => {
  it('a fast car snaps it off and ploughs on', () => {
    const r = propTest('prop.cactus', 120);
    expect(r.piece!.down).toBe(true);
    expect(r.events).toContain('fall');
  });

  it('a slow car only bumps it', () => {
    const r = propTest('prop.cactus', 30);
    expect(r.piece!.down).toBeFalsy();
  });
});
