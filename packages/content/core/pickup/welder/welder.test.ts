import { rangeGive, rangeHit, rangeMend, rangeWreck } from '@demodogs/sim';
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { bench, put } from '../../../src/testing';

const welder = () => loadContent().pickup.get('pickup.welder')!;

describe('pickup.welder', () => {
  it('does its job when it is the only pickup on offer', () => {
    const w = bench();
    (w.venue as { pickups: string[] }).pickups = ['pickup.welder'];
    const c = w.player;
    c.hp = 30;
    w.pickups[0]!.on = true;
    put(c, w.pickups[0]!.x, w.pickups[0]!.y, 0);
    w.step();
    expect(c.weldT).toBeGreaterThan(0);
    expect(w.pickups[0]!.on).toBe(false);
  });

  it('puts the armour back a little at a time, then the lost parts', () => {
    const w = bench();
    const c = w.player;
    for (let i = 0; i < 6 && c.hp > 32; i++) rangeHit(w, c, 25, c.x + 5, c.y);
    c.hp = 25;
    expect(c.has).toEqual({ front: false, rear: false, top: false });
    rangeGive(w, c, welder());
    w.takeEvents();
    w.step();
    expect(c.hp).toBeGreaterThan(25);
    expect(c.hp).toBeLessThan(27);
    for (let i = 0; i < 60 * 5; i++) w.step();
    expect(c.hp).toBeCloseTo(85, 5);
    expect(c.weldT).toBe(0);
    expect(c.has).toEqual({ front: true, rear: true, top: true });
    const ev = w.takeEvents();
    expect(ev.filter((e) => e.t === 'weld' && e.what === 'part')).toHaveLength(3);
    expect(ev.some((e) => e.t === 'weld' && e.what === 'done')).toBe(true);
  });

  it('a second welder adds on, and it stops at full armour', () => {
    const w = bench();
    const c = w.player;
    c.hp = 10;
    rangeGive(w, c, welder());
    rangeGive(w, c, welder());
    for (let i = 0; i < 60 * 5; i++) w.step();
    expect(c.hp).toBe(100);
    expect(c.weldT).toBe(0);
  });

  it('stops when the car is wrecked or mended', () => {
    const w = bench();
    const c = w.player;
    c.hp = 20;
    rangeGive(w, c, welder());
    rangeWreck(w, c);
    w.step();
    expect(c.weldT).toBe(0);
    rangeMend(w, c);
    rangeGive(w, c, welder());
    rangeMend(w, c);
    expect(c.weldT).toBe(0);
    rangeGive(w, c, welder());
    c.wrecked = true;
    rangeGive(w, c, welder());
    expect(c.weldRate).toBeGreaterThan(0);
  });

  it('is in every venue', () => {
    for (const v of loadContent().venue.values()) expect(v.pickups).toContain('pickup.welder');
  });
});
