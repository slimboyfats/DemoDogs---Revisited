import { describe, expect, it } from 'vitest';
import { NO_CONTROLS } from '@demodogs/shared';
import { SINK_TIME, explode, footing, spill, wading } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { bench, flatBench, openSpot, put } from '../../../src/testing';

const def = loadContent().material.get('material.lagoon')!;

describe('material.lagoon', () => {
  it('slows a car and takes grip, and a blast does not light it', () => {
    const w = bench();
    const [x, y] = openSpot(w, 80);
    spill(w, def, x, y, 14, -1, true);
    const [grip, drag] = footing(w, x, y);
    expect(grip).toBeLessThan(0.8);
    expect(drag).toBeGreaterThan(1.5);
    explode(w, x + 22, y, 0.5, null);
    expect(w.blazes.length).toBe(0);
    expect(w.spills.length).toBe(1);
  });

  it('is waded near its shore, and too deep further out: a racing car goes under and is put back on the road it left', () => {
    const w = bench();
    const c = w.player;
    for (let k = 0; k < 5; k++) w.step(NO_CONTROLS);
    w.takeEvents();
    const [x, y] = openSpot(w, 130);
    spill(w, def, x, y, 120, -1, true);
    // in the shallows it wades
    put(c, x + 100, y, 0, 0);
    for (let k = 0; k < 30; k++) w.step(NO_CONTROLS);
    expect(wading(w, c)[0]).toBeGreaterThan(0);
    expect(wading(w, c)[1]).toBe(false);
    expect(w.takeEvents().some((e) => e.t === 'sink')).toBe(false);
    // out in the dark water it sinks, at once, and is back on the road soon after
    put(c, x, y, 0, 0);
    w.step(NO_CONTROLS);
    expect(w.takeEvents().some((e) => e.t === 'sink')).toBe(true);
    expect(c.drown).toBeGreaterThan(0);
    let back = false;
    for (let k = 0; k < SINK_TIME * 60 + 2; k++) {
      w.step(NO_CONTROLS);
      back ||= w.takeEvents().some((e) => e.t === 'rescue');
    }
    expect(back).toBe(true);
    expect(c.drown).toBe(0);
    expect(w.offroad(c.x, c.y)).toBe(false);
    expect(wading(w, c)[0]).toBe(0);
  });

  it('is not sunk in where nobody is put back: a derby wades it all', () => {
    const w = flatBench();
    const c = w.player;
    for (let k = 0; k < 5; k++) w.step(NO_CONTROLS);
    spill(w, def, c.x, c.y, 120, -1, true);
    for (let k = 0; k < 30; k++) w.step(NO_CONTROLS);
    expect(wading(w, c)[1]).toBe(true);
    expect(c.drown ?? 0).toBe(0);
  });
});
