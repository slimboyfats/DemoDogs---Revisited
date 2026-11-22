import { FIELD_SIZE, NO_CONTROLS, type Controls } from '@demodogs/shared';
import { FINISH_GRACE, World, datan2, dcos, dexp, dhypot, dsin } from '@demodogs/sim';
import { describe, expect, it } from 'vitest';
import { loadContent } from './index';

const content = loadContent();
const humans = [
  { car: 'car.pug', name: 'TWO', paint: '#3fa9f5' },
  { car: 'car.terrier', name: 'THREE', paint: '#ff5a4f' },
];
const world = (venue: string, you = 0) =>
  new World({ content, venue, car: 'car.mutt', seed: 3, humans, you });
const go: Controls = { ...NO_CONTROLS, throttle: 1 };

describe('online: several human drivers in one world', () => {
  it('seats the humans and fills the rest of the field with rivals', () => {
    const w = world('venue.kennel-loop');
    expect(w.humans.map((c) => c.seat)).toEqual([0, 1, 2]);
    expect(w.humans.every((c) => c.isPlayer && !c.ai)).toBe(true);
    expect(w.cars).toHaveLength(FIELD_SIZE);
    expect(w.cars.filter((c) => c.ai)).toHaveLength(FIELD_SIZE - 3);
  });

  it('runs the same race whichever seat the screen follows', () => {
    for (const venue of ['venue.kennel-loop', 'venue.the-pit']) {
      const ws = [0, 1, 2].map((you) => world(venue, you));
      expect(ws.map((w) => w.player.seat)).toEqual([0, 1, 2]);
      for (let t = 0; t < 900; t++) {
        const seats = [go, { ...go, steer: Math.sin(t / 30) }, { ...go, fire: t % 50 === 0 }];
        for (const w of ws) w.stepSeats(seats);
      }
      expect(new Set(ws.map((w) => w.hash())).size).toBe(1);
    }
  });

  it('single-player step() is stepSeats() with one seat', () => {
    const a = new World({ content, venue: 'venue.kennel-loop', car: 'car.mutt', seed: 5 });
    const b = new World({ content, venue: 'venue.kennel-loop', car: 'car.mutt', seed: 5 });
    for (let t = 0; t < 600; t++) {
      a.step(go);
      b.stepSeats([go]);
    }
    expect(a.hash()).toBe(b.hash());
  });

  it('a derby goes on until every human is scrap', () => {
    const w = world('venue.the-pit');
    w.phase = 'race';
    w.humans[0]!.wrecked = true;
    w.stepSeats([]);
    expect(w.endT).toBeLessThan(0);
    for (const c of w.humans) c.wrecked = true;
    w.stepSeats([]);
    expect(w.endT).toBeGreaterThan(0);
  });

  it('once one human finishes a race the others get a grace period', () => {
    const w = world('venue.kennel-loop');
    w.phase = 'race';
    const first = w.humans[1]!;
    // finishing is noticed by the lap counter: fake it the way race.ts does
    first.finished = true;
    w.finishers.push(first.index);
    w.finishBy = w.raceTime + FINISH_GRACE;
    for (let t = 0; t < 60 * (FINISH_GRACE + 1); t++) w.stepSeats([]);
    expect(w.phase).toBe('over');
  });
});

describe('deterministic maths in a race', () => {
  it('a race run on the sim maths is deterministic too', () => {
    const M = Math as unknown as Record<string, unknown>;
    const saved = { sin: M.sin, cos: M.cos, atan2: M.atan2, exp: M.exp, hypot: M.hypot };
    Object.assign(M, { sin: dsin, cos: dcos, atan2: datan2, exp: dexp, hypot: dhypot });
    try {
      const hashes = [1, 2].map(() => {
        const w = world('venue.kennel-loop', 1);
        for (let t = 0; t < 900; t++) w.stepSeats([go, go, go]);
        return w.hash();
      });
      expect(hashes[0]).toBe(hashes[1]);
    } finally {
      Object.assign(M, saved);
    }
  });
});
