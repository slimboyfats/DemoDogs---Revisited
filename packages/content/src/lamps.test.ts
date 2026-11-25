import { describe, expect, it } from 'vitest';
import { LAMP, explode } from '@demodogs/sim';
import { flatBench, put } from './testing';

/** A blast just off a corner of the player's car: `fore` 1 its nose, -1 its tail; `side` -1 left, 1 right. */
function blastAt(fore: number, side: number, power = 1.2) {
  const w = flatBench();
  const c = w.player;
  put(c, w.oval!.cx, w.oval!.cy, 0);
  const L = c.def.body.halfLength + 2;
  const W = c.def.body.halfWidth + 2;
  explode(w, c.x + fore * L, c.y + side * W, power, null);
  return c;
}

describe('lamps', () => {
  it('are all whole on a car that has not been hit', () => {
    expect(flatBench().player.lamps).toBe(0);
  });

  it('break one at a time, at the corner the blow lands on', () => {
    expect(blastAt(1, -1).lamps).toBe(LAMP.headLeft);
    expect(blastAt(1, 1).lamps).toBe(LAMP.headRight);
    expect(blastAt(-1, -1).lamps).toBe(LAMP.tailLeft);
    expect(blastAt(-1, 1).lamps).toBe(LAMP.tailRight);
  });

  it('both go with the bumper they are on', () => {
    const c = blastAt(1, -1, 2);
    expect(c.has.front).toBe(false);
    expect(c.lamps & (LAMP.headLeft | LAMP.headRight)).toBe(LAMP.headLeft | LAMP.headRight);
  });
});
