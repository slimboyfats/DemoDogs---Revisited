import { describe, expect, it } from 'vitest';
import { saysOff } from './settings';

describe('a switch on the settings sheet', () => {
  it('is off when its label says so', () => {
    expect(saysOff('FLAME LIGHT OFF')).toBe(true);
    expect(saysOff('NAMES OFF ')).toBe(true);
    expect(saysOff('SOUND ON')).toBe(false);
    expect(saysOff('MUSIC OFF, FX ON')).toBe(false);
    expect(saysOff('KICKOFF')).toBe(false);
  });
});
