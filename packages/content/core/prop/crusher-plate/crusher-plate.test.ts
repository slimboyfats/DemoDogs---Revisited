import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

describe('prop.crusher-plate', () => {
  it('is the ram some press draws', () => {
    const C = loadContent();
    const users = [...C.prop.values()].filter((p) => p.press?.plate === 'prop.crusher-plate');
    expect(users.length).toBeGreaterThan(0);
    expect(C.prop.get('prop.crusher-plate')!.solid).toBe(false);
  });
});
