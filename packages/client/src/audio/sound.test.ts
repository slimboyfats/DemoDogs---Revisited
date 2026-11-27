import { describe, expect, it } from 'vitest';
import { pickupCall } from './sound';

describe('pickup calls', () => {
  it('the same kind always has the same call, and kinds mostly differ', () => {
    expect(pickupCall('shield')).toEqual(pickupCall('shield'));
    const kinds = ['shield', 'jet', 'magnet', 'springs', 'grow', 'shrink', 'tank', 'cage', 'decoy'];
    const calls = new Set(kinds.map((k) => JSON.stringify(pickupCall(k))));
    expect(calls.size).toBeGreaterThan(6);
  });

  it('a pickup without a kind has the plain call', () => {
    expect(pickupCall('')).toEqual([523, [0, 4, 7, 12], 'square']);
  });
});
