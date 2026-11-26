import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

describe('prop.jump-landing', () => {
  it('is a piece of road laid off the road that stands high at its back and runs down', () => {
    const def = loadContent().prop.get('prop.jump-landing')!;
    expect(def.pad?.kind).toBe('road');
    expect(def.leap?.way).toBe('down');
    expect(def.leap!.long).toBe(def.pad!.long);
    expect(def.solid).toBe(false);
  });
});
