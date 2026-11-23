import { describe, expect, it } from 'vitest';
import { NO_CONTROLS, type SimEvent } from '@demodogs/shared';
import { stand } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { flatBench, put } from '../../../src/testing';

const C = loadContent();

function range(wall: string) {
  const w = flatBench({ rivals: 2 });
  const [x, y] = [w.oval!.cx, w.oval!.cy];
  const me = w.player;
  const [a, b] = w.cars.filter((c) => c !== me);
  a!.ai = b!.ai = null;
  put(me, x - 120, y, 0);
  put(a!, x - 60, y, 0);
  const piece = stand(w, C.prop.get(wall)!, x, y, 0, 0);
  put(b!, x + 60, y, 0);
  me.weapon = C.weapon.get('weapon.long-bark')!;
  me.ammo = 2;
  w.step({ ...NO_CONTROLS, fire: true });
  const events = w.takeEvents();
  return { w, me, a: a!, b: b!, piece, events };
}

describe('weapon.long-bark', () => {
  it('goes through a car and a brick wall into the car behind it', () => {
    const { a, b, piece, events, me } = range('prop.brick-wall');
    expect(a.hp).toBeLessThan(100);
    expect(piece.down).toBe(true);
    expect(b.hp).toBeLessThan(100);
    expect(me.ammo).toBe(1);
    const rail = events.find((e) => e.t === 'rail') as Extract<SimEvent, { t: 'rail' }>;
    expect(rail.tx).toBeGreaterThan(b.x);
  });

  it('is stopped by concrete, which only takes a bite', () => {
    const { a, b, piece, events } = range('prop.concrete-wall');
    expect(a.hp).toBeLessThan(100);
    expect(piece.down).toBeFalsy();
    expect(piece.hp).toBeLessThan(110);
    expect(b.hp).toBe(100);
    expect(events.some((e) => e.t === 'chip')).toBe(true);
  });
});
