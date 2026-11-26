import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

describe('prop.pump-flap', () => {
  it('is the part a pump takeoff names, and not solid', () => {
    const C = loadContent();
    expect(C.prop.get('prop.pump-takeoff')!.leap!.pump!.plate).toBe('prop.pump-flap');
    expect(C.prop.get('prop.pump-flap')!.solid).toBe(false);
  });
});
