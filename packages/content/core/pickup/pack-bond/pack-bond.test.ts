import { describe, expect, it } from 'vitest';
import { give, guardArena, inTheKit } from '../../../src/guard-testing';
import { put } from '../../../src/testing';
import { rangeHit } from '@demodogs/sim';

describe('pickup.pack-bond', () => {
  it('passes half of a blow to the nearest rival in reach', () => {
    const plain = guardArena();
    rangeHit(plain.w, plain.me, 20, plain.x, plain.y);
    const whole = 100 - plain.me.hp;
    expect(whole).toBeGreaterThan(5);

    const { w, me, a, b, x, y } = guardArena();
    put(a, x + 50, y, 0);
    put(b, x - 80, y, 0);
    give(w, me, 'pickup.pack-bond');
    w.takeEvents();
    rangeHit(w, me, 20, x, y);
    expect(100 - me.hp).toBeCloseTo(whole / 2, 5);
    expect(100 - a.hp).toBeCloseTo(whole / 2, 5);
    expect(b.hp).toBe(100);
    const ev = w.takeEvents().find((e) => e.t === 'guard' && e.what === 'use');
    expect(ev).toMatchObject({ kind: 'bond', car: me.index, tx: a.x, ty: a.y });
  });

  it('has nobody to pass it to when no rival is in reach', () => {
    const { w, me, x, y } = guardArena();
    give(w, me, 'pickup.pack-bond');
    rangeHit(w, me, 20, x, y);
    expect(me.hp).toBeLessThan(95);
  });

  it('two leashed cars hand a blow back and forth until nothing is left of it', () => {
    const { w, me, a, x, y } = guardArena();
    put(a, x + 50, y, 0);
    give(w, me, 'pickup.pack-bond');
    give(w, a, 'pickup.pack-bond');
    rangeHit(w, me, 30, x, y);
    expect(me.hp).toBeLessThan(100);
    expect(a.hp).toBeLessThan(100);
    expect(me.hp).toBeGreaterThan(a.hp - 30);
  });

  it('comes out of a kit crate that is in every venue', () => {
    expect(inTheKit('pickup.pack-bond')).toBe(true);
  });
});
