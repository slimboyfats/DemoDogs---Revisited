import { describe, expect, it } from 'vitest';
import { stand, ventOpen } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { flatBench, put } from '../../../src/testing';

describe('prop.geyser', () => {
  const run = (blowing: boolean) => {
    const w = flatBench();
    const x = w.oval!.cx;
    const y = w.oval!.cy;
    const s = stand(w, loadContent().prop.get('prop.geyser')!, x, y, 0, 0);
    // wait for the beat: just blowing, or just stopped
    for (let i = 0; i < 600 && ventOpen(w, s) !== blowing; i++) w.step();
    for (let i = 0; i < 600 && !blowing && !ventOpen(w, s, 0, w.time - 0.2) === false; i++)
      w.step();
    put(w.player, x - 20, y, 0, 60);
    const events: string[] = [];
    let maxZ = 0;
    for (let i = 0; i < 50; i++) {
      w.step({ steer: 0, throttle: 0.4, brake: false, boost: false, fire: false });
      for (const e of w.takeEvents()) if (e.t === 'pad') events.push(e.kind);
      maxZ = Math.max(maxZ, w.player.z);
    }
    return { maxZ, events };
  };
  it('throws a car that is over it when it blows', () => {
    const r = run(true);
    expect(r.events).toContain('vent');
    expect(r.maxZ).toBeGreaterThan(14);
  });
  it('lets a car cross while it is quiet', () => {
    const r = run(false);
    expect(r.events).toEqual([]);
    expect(r.maxZ).toBeLessThan(1);
  });
  it('blows on a beat: on for a second or so in every few', () => {
    const w = flatBench();
    const s = stand(w, loadContent().prop.get('prop.geyser')!, w.oval!.cx, w.oval!.cy, 0, 3);
    let on = 0;
    for (let i = 0; i < 60 * 9; i++) {
      w.step();
      if (ventOpen(w, s)) on++;
    }
    expect(on).toBeGreaterThan(60 * 2);
    expect(on).toBeLessThan(60 * 3.2);
  });
});
