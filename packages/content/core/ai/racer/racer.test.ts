import { describe, expect, it } from 'vitest';
import { makeWorld, runUntil } from '../../../src/testing';

describe('ai.racer', () => {
  it('gets round the track: a lap within 50 seconds', () => {
    const w = makeWorld({ autopilot: true, rivals: 0 });
    w.bots.length = 0;
    runUntil(w, (w) => w.player.lap >= 2, 60 * 54);
    expect(w.player.lap).toBeGreaterThanOrEqual(2);
  });
});
