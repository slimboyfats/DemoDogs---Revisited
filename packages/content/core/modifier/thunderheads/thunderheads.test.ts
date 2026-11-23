import { describe, expect, it } from 'vitest';
import { rangeEvent } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { flatBench, put } from '../../../src/testing';

const def = loadContent().modifier.get('modifier.thunderheads')!;

describe('modifier.thunderheads', () => {
  it('warns, then strikes the same spot', () => {
    const w = flatBench({ modifiers: [def.id] });
    let omen: { x: number; y: number; in: number; tick: number } | null = null;
    let bolt: { x: number; y: number; tick: number } | null = null;
    for (let i = 0; i < 60 * 20 && !bolt; i++) {
      w.step();
      for (const e of w.takeEvents()) {
        if (e.t === 'omen' && !omen) omen = { x: e.x, y: e.y, in: e.in, tick: w.tick };
        if (e.t === 'bolt') bolt = { x: e.x, y: e.y, tick: w.tick };
      }
    }
    expect(omen).not.toBeNull();
    expect(bolt).toMatchObject({ x: omen!.x, y: omen!.y });
    expect((bolt!.tick - omen!.tick) / 60).toBeCloseTo(def.warn, 1);
  });

  it('cuts out the engine of a car close to the strike, and blasts it', () => {
    const w = flatBench();
    const c = w.player;
    put(c, w.oval!.cx, w.oval!.cy, 0);
    rangeEvent(w, def, c.x + 20, c.y);
    const seen: string[] = [];
    for (let i = 0; i < 80; i++) {
      w.step({ steer: 0, throttle: 0, brake: false, boost: false, fire: false });
      for (const e of w.takeEvents()) seen.push(e.t);
    }
    expect(seen).toContain('bolt');
    expect(seen).toContain('stall');
    expect(seen).toContain('explode');
    expect(c.hp).toBeLessThan(100);
  });

  it('runs through water: a car in a pool the bolt touched stalls from further off', () => {
    const w = flatBench();
    const c = w.player;
    const water = loadContent().material.get('material.water')!;
    put(c, w.oval!.cx, w.oval!.cy, 0);
    w.spills.push({ def: water, x: c.x + 60, y: c.y, r: 70, owner: -1 });
    rangeEvent(w, def, c.x + 120, c.y);
    for (let i = 0; i < 60; i++)
      w.step({ steer: 0, throttle: 0, brake: false, boost: false, fire: false });
    expect(c.stall).toBeGreaterThan(0);
  });
});
