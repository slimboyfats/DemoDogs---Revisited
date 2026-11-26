import { describe, expect, it } from 'vitest';
import { NO_CONTROLS } from '@demodogs/shared';
import { grant, odds } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { makeWorld, startRace } from '../../../src/testing';

const def = () => loadContent().pickup.get('pickup.sniffer-pack')!;

describe('pickup.sniffer-pack', () => {
  it('hands over three seeker rockets', () => {
    const w = startRace(makeWorld());
    expect(grant(w, w.player, def())).toBe('SNIFFER x3');
    expect(w.player.weapon?.id).toBe('weapon.sniffer');
    expect(w.player.ammo).toBe(3);
  });

  it('a rocket fired with nobody in its sights takes the next car up the road', () => {
    const w = startRace(makeWorld());
    for (let i = 0; i < 60; i++) w.step();
    const c = w.player;
    const ahead = w.cars.filter((o) => o.progress > c.progress);
    const next = ahead.reduce((a, b) => (b.progress < a.progress ? b : a));
    // pointing the wrong way: nobody ahead of its nose
    c.h += Math.PI;
    c.vx = c.vy = 0;
    grant(w, c, def());
    c.fireCd = 0;
    w.step({ ...NO_CONTROLS, fire: true });
    expect(w.rockets.length).toBeGreaterThan(0);
    expect(w.rockets[0]!.target).toBe(next.index);
    expect(w.rockets[0]!.idx).toBeDefined();
  });

  it('is at every race venue and leans to the back of the field', () => {
    expect(odds(def(), false, 1)).toBeGreaterThan(odds(def(), false, 0) * 10);
    for (const v of loadContent().venue.values())
      expect(v.pickups.includes('pickup.sniffer-pack')).toBe(v.mode === 'mode.race');
  });
});
