import { describe, expect, it } from 'vitest';
import { actionsOf, hintFor, isKey, keyName, KEYS, type Action } from './keys';

describe('key bindings', () => {
  it('every action has a key, and no key does two things', () => {
    const seen = new Map<string, Action>();
    for (const a of Object.keys(KEYS) as Action[]) {
      expect(KEYS[a].length).toBeGreaterThan(0);
      for (const k of KEYS[a]) {
        expect(k).toBe(k.toLowerCase());
        expect(seen.get(k)).toBeUndefined();
        seen.set(k, a);
      }
    }
  });

  it('names the keys the way a key cap prints them', () => {
    expect(hintFor('boost')).toBe('SPACE');
    expect(hintFor('fire')).toBe('X');
    expect(hintFor('brake')).toBe('S');
    expect(hintFor('pause')).toBe('P');
    expect(keyName('arrowleft')).toBe('◀');
    expect(keyName('escape')).toBe('ESC');
  });

  it('finds what a key does', () => {
    expect(actionsOf('arrowdown')).toEqual(['brake']);
    expect(actionsOf('shift')).toEqual(['fire']);
    expect(actionsOf('q')).toEqual([]);
    expect(isKey('boost', ' ')).toBe(true);
    expect(isKey('boost', 'x')).toBe(false);
  });
});
