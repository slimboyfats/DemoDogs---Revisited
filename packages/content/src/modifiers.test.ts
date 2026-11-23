import { NO_CONTROLS, type Controls } from '@demodogs/shared';
import { World } from '@demodogs/sim';
import { describe, expect, it } from 'vitest';
import { loadContent } from './index';

const content = loadContent();
const ALL = [...content.modifier.keys()];
const humans = [{ car: 'car.pug', name: 'TWO', paint: '#3fa9f5' }];
const go: Controls = { ...NO_CONTROLS, throttle: 1 };

describe('world modifiers: every one at once', () => {
  it('ships ten', () => {
    expect(ALL).toHaveLength(10);
    expect(new Set(ALL.map((id) => content.modifier.get(id)!.kind)).size).toBe(10);
  });

  it('two screens of one online race stay in step, whatever order the list came in', () => {
    for (const venue of ['venue.kennel-loop', 'venue.the-pit']) {
      const ws = [0, 1].map(
        (you) =>
          new World({
            content,
            venue,
            car: 'car.mutt',
            seed: 11,
            humans,
            you,
            modifiers: you ? [...ALL].reverse() : ALL,
          }),
      );
      for (let t = 0; t < 1500; t++) {
        const seats = [go, { ...go, steer: Math.sin(t / 30), fire: t % 40 === 0 }];
        for (const w of ws) w.stepSeats(seats);
        if (t % 300 === 299) expect(ws[0]!.hash()).toBe(ws[1]!.hash());
      }
      expect(ws[0]!.mods).toHaveLength(10);
    }
  });

  it('a world with modifiers runs a different race from one without', () => {
    const run = (modifiers: string[]) => {
      const w = new World({
        content,
        venue: 'venue.kennel-loop',
        car: 'car.mutt',
        seed: 4,
        modifiers,
      });
      for (let t = 0; t < 900; t++) w.step(go);
      return w.hash();
    };
    expect(run(ALL)).not.toBe(run([]));
  });
});
