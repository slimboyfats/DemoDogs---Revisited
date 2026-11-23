import { describe, expect, it } from 'vitest';
import { rangeEvent } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { flatBench, makeWorld, put, startRace } from '../../../src/testing';

const def = loadContent().modifier.get('modifier.scrapfall')!;

describe('modifier.scrapfall', () => {
  it('marks where a piece will land, then blows a pit there and throws fire about', () => {
    const w = flatBench();
    const c = w.player;
    put(c, w.oval!.cx, w.oval!.cy, 0);
    rangeEvent(w, def, c.x + 90, c.y);
    const seen: string[] = [];
    let at = 0;
    const t0 = w.tick;
    for (let i = 0; i < 60 * 3; i++) {
      w.step();
      for (const e of w.takeEvents()) {
        seen.push(e.t);
        if (e.t === 'skyfall') at = w.tick;
      }
    }
    expect(seen).toContain('omen');
    expect(seen).toContain('explode');
    expect(seen).toContain('crater');
    expect((at - t0) / 60).toBeCloseTo(def.warn, 1);
    expect(w.craters.length).toBe(1);
  });

  it('hurts a car that stays under it', () => {
    const w = flatBench();
    const c = w.player;
    put(c, w.oval!.cx, w.oval!.cy, 0);
    rangeEvent(w, def, c.x, c.y);
    for (let i = 0; i < 60 * 2; i++)
      w.step({ steer: 0, throttle: 0, brake: false, boost: false, fire: false });
    expect(c.hp).toBeLessThan(95);
  });

  it('keeps falling through a race, and leaves some of it standing, up to its limit', () => {
    const w = startRace(makeWorld({ rivals: 2, seed: 5, modifiers: [def.id] }));
    const before = w.statics.length;
    let falls = 0;
    for (let i = 0; i < 60 * 90; i++) {
      w.step();
      falls += w.takeEvents().filter((e) => e.t === 'skyfall').length;
    }
    expect(falls).toBeGreaterThan(15);
    const left = w.statics.slice(before).filter((s) => s.def.id === def.leaves!.prop);
    expect(left.length).toBeGreaterThan(2);
    expect(left.length).toBeLessThanOrEqual(def.leaves!.max);
  });
});
