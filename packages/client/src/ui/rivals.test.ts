import { describe, expect, it } from 'vitest';
import { nextLevel, parseLevel } from './rivals';

describe('rivals setting', () => {
  it('steps easy, normal, hard and round again', () => {
    expect(nextLevel('easy')).toBe('normal');
    expect(nextLevel('normal')).toBe('hard');
    expect(nextLevel('hard')).toBe('easy');
  });

  it('reads a level and refuses nonsense', () => {
    expect(parseLevel('hard')).toBe('hard');
    expect(parseLevel('brutal')).toBeNull();
    expect(parseLevel(null)).toBeNull();
  });
});
