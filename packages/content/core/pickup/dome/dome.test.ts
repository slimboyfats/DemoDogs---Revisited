import { DT } from '@demodogs/shared';
import { rangeGive, rangeHit } from '@demodogs/sim';
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { bench, put } from '../../../src/testing';

const dome = () => loadContent().pickup.get('pickup.dome')!;

describe('pickup.dome', () => {
  it('does its job when it is the only pickup on offer', () => {
    const w = bench();
    (w.venue as { pickups: string[] }).pickups = ['pickup.dome'];
    const c = w.player;
    w.pickups[0]!.on = true;
    put(c, w.pickups[0]!.x, w.pickups[0]!.y, 0);
    w.step();
    expect(c.shield).toBe(40);
    expect(w.pickups[0]!.on).toBe(false);
    expect(w.takeEvents().some((e) => e.t === 'shield' && e.what === 'up')).toBe(true);
  });

  it('soaks up blows without a scratch until it is spent, then bursts', () => {
    const w = bench();
    const c = w.player;
    rangeGive(w, c, dome());
    w.takeEvents();
    rangeHit(w, c, 20, c.x + 5, c.y);
    expect(c.hp).toBe(100);
    expect(c.shield).toBeLessThan(40);
    const ev = w.takeEvents();
    expect(ev.some((e) => e.t === 'hit')).toBe(false);
    expect(ev.find((e) => e.t === 'shield')).toMatchObject({ what: 'hit' });
    // keep hitting: it pops, and only the last blow's overflow gets through, softened
    for (let i = 0; i < 20 && c.shield > 0; i++) rangeHit(w, c, 30, c.x + 5, c.y);
    expect(c.shield).toBe(0);
    expect(w.takeEvents().some((e) => e.t === 'shield' && e.what === 'pop')).toBe(true);
    expect(c.hp).toBeGreaterThan(80);
    rangeHit(w, c, 30, c.x + 5, c.y);
    expect(c.hp).toBeLessThan(100);
  });

  it('fades when its time is up, and a wreck loses it', () => {
    const w = bench();
    const c = w.player;
    rangeGive(w, c, dome());
    for (let t = 0; t < 8.2; t += DT) w.step();
    expect(c.shield).toBe(0);
    expect(w.takeEvents().some((e) => e.t === 'shield' && e.what === 'fade')).toBe(true);
    rangeGive(w, c, dome());
    c.wrecked = true;
    w.step();
    expect(c.shield).toBe(0);
  });

  it('is in every venue', () => {
    for (const v of loadContent().venue.values()) expect(v.pickups).toContain('pickup.dome');
  });
});
