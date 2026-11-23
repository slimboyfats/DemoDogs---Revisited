import { describe, expect, it } from 'vitest';
import { makeWorld, runUntil } from '@demodogs/content/testing';
import { rangeWreck, type World } from '@demodogs/sim';
import { DT } from '@demodogs/shared';
import { LINGER, Spectator, scrapped, sidelined, watchable, zooms } from './spectate';

/** An online derby as seat `you` sees it: two human drivers and the bots, past the countdown. */
function derby(you = 0): World {
  const w = makeWorld({
    venue: 'venue.the-pit',
    car: 'car.pug',
    seed: 5,
    humans: [{ car: 'car.mutt', name: 'GUEST', paint: '#3fa9f5' }],
    you,
  });
  runUntil(w, (x) => x.phase === 'race', 60 * 20);
  return w;
}

/** Real frames until the spectator has had `seconds`. */
function wait(s: Spectator, w: World, seconds: number): void {
  for (let t = 0; t < seconds; t += DT) s.update(w, DT);
}

describe('spectating', () => {
  it('leaves a driver who is still in it alone', () => {
    const w = derby();
    const s = new Spectator();
    wait(s, w, 5);
    expect(sidelined(w)).toBe(false);
    expect(s.active).toBe(false);
    s.next(w, 1);
    expect(s.target).toBeNull();
  });

  it('moves to another car a moment after yours is scrapped, the other driver first', () => {
    const w = derby();
    rangeWreck(w, w.player);
    expect(scrapped(w, w.player)).toBe(true);
    expect(w.endT).toBeLessThan(0);
    const s = new Spectator();
    wait(s, w, LINGER / 2);
    expect(s.active).toBe(false);
    wait(s, w, LINGER);
    expect(s.active).toBe(true);
    expect(s.target).toBe(w.humans[1]);
  });

  it('steps through every running car, both ways, and never to your own', () => {
    const w = derby();
    rangeWreck(w, w.player);
    const s = new Spectator();
    wait(s, w, LINGER * 2);
    const list = watchable(w);
    expect(list).toHaveLength(w.cars.length - 1);
    const seen = [s.target];
    for (let i = 1; i < list.length; i++) {
      s.next(w, 1);
      seen.push(s.target);
    }
    expect(seen).toEqual(list);
    s.next(w, 1);
    expect(s.target).toBe(list[0]);
    s.next(w, -1);
    expect(s.target).toBe(list[list.length - 1]);
  });

  it('moves on when the car being watched is scrapped too', () => {
    const w = derby();
    rangeWreck(w, w.player);
    const s = new Spectator();
    wait(s, w, LINGER * 2);
    const first = s.target!;
    s.next(w, 1);
    const second = s.target!;
    rangeWreck(w, second);
    wait(s, w, LINGER / 2);
    expect(s.target).toBe(second);
    wait(s, w, LINGER);
    expect(s.target).not.toBe(second);
    expect(s.target!.wrecked).toBe(false);
    expect(watchable(w)).not.toContain(second);
    expect(watchable(w)).toContain(first);
  });

  it('is only a viewpoint: the race is the same whoever watches what', () => {
    const run = (look: boolean): string => {
      const w = derby(1);
      rangeWreck(w, w.player);
      const s = new Spectator();
      for (let i = 0; i < 240; i++) {
        w.stepSeats(
          w.humans.map(() => ({
            throttle: 1,
            steer: 0.2,
            brake: false,
            boost: false,
            fire: false,
          })),
        );
        if (!look) continue;
        s.update(w, DT);
        if (i % 30 === 0) s.next(w, 1);
        if (i % 50 === 0) s.nextZoom(3);
      }
      return w.hash();
    };
    expect(run(true)).toBe(run(false));
  });

  it('does not start when the race is already ending', () => {
    const w = makeWorld({ venue: 'venue.the-pit', car: 'car.pug', seed: 5 });
    runUntil(w, (x) => x.phase === 'race', 60 * 20);
    rangeWreck(w, w.player);
    w.step({ throttle: 0, steer: 0, brake: false, boost: false, fire: false });
    expect(w.endT).toBeGreaterThan(0);
    const s = new Spectator();
    wait(s, w, LINGER * 2);
    expect(s.active).toBe(false);
  });

  it('an offline derby that plays on can be watched to its end', () => {
    const w = makeWorld({ venue: 'venue.the-pit', car: 'car.pug', seed: 5, playOn: true });
    runUntil(w, (x) => x.phase === 'race', 60 * 20);
    rangeWreck(w, w.player);
    const place = w.standings().indexOf(w.player);
    w.step({ throttle: 0, steer: 0, brake: false, boost: false, fire: false });
    expect(w.endT).toBeLessThan(0);
    const s = new Spectator();
    wait(s, w, LINGER * 2);
    expect(s.active).toBe(true);
    // it still ends: on its last car, or the clock
    runUntil(w, (x) => x.phase === 'over', 60 * 400);
    expect(w.phase).toBe('over');
    // and the place you were scrapped in is the place you keep
    expect(w.standings().indexOf(w.player)).toBe(place);
  });

  it('a towed race car is not out, a finished one is', () => {
    const w = makeWorld({
      venue: 'venue.kennel-loop',
      car: 'car.pug',
      seed: 5,
      humans: [{ car: 'car.mutt', name: 'GUEST', paint: '#3fa9f5' }],
    });
    runUntil(w, (x) => x.phase === 'race', 60 * 20);
    rangeWreck(w, w.player);
    expect(scrapped(w, w.player)).toBe(false);
    expect(sidelined(w)).toBe(false);
    w.player.finished = true;
    expect(sidelined(w)).toBe(true);
  });

  it('offers the whole arena only where it fits on screen', () => {
    // a phone: 375 by 209 art pixels of ground
    expect(zooms(1060, 840, 375, 209).map((z) => z.label)).toEqual([
      'CLOSE',
      'WIDE',
      'WHOLE ARENA',
    ]);
    expect(zooms(2000, 1400, 375, 209).map((z) => z.label)).toEqual(['CLOSE', 'WIDE']);
    const s = new Spectator();
    s.nextZoom(3);
    expect(s.zoom).toBe(0);
  });
});
