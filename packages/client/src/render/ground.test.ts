import { describe, expect, it } from 'vitest';
import { markGround, type Ground } from './ground';

describe('markGround', () => {
  it('grows one box around everything painted', () => {
    const g = { dirty: null } as unknown as Ground;
    markGround(g, 10, 10, 2);
    expect(g.dirty).toEqual([8, 8, 12, 12]);
    markGround(g, 30.5, 4, 1);
    expect(g.dirty).toEqual([8, 3, 32, 12]);
  });
});
