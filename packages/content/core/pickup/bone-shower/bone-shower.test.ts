import { describe, expect, it } from 'vitest';
import { grant } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { flatBench, makeWorld, put, startRace } from '../../../src/testing';

const def = () => loadContent().pickup.get('pickup.bone-shower')!;

describe('pickup.bone-shower', () => {
  it('drops its bones over every rival ahead, and none over anyone else', () => {
    const w = startRace(makeWorld());
    for (let i = 0; i < 30; i++) w.step();
    const c = w.player;
    const ahead = w.cars.filter((o) => o.progress > c.progress);
    const n0 = w.props.length;
    expect(grant(w, c, def())).toBe(`BONE SHOWER x${ahead.length * def().charges!}`);
    const bones = w.props.slice(n0);
    expect(bones).toHaveLength(ahead.length * def().charges!);
    for (const b of bones) {
      expect(b.def.id).toBe('prop.big-bone');
      expect(b.z).toBeGreaterThan(100);
      expect(ahead.some((o) => Math.hypot(o.x - b.x, o.y - b.y) < 200)).toBe(true);
    }
  });

  it('hurts a car a bone comes down on, and leaves the bones lying there', () => {
    const w = flatBench();
    const c = w.player;
    const o = w.cars[1]!;
    put(c, 300, 300, 0);
    put(o, 400, 300, 0);
    const hp = o.hp;
    const n0 = w.props.length;
    grant(w, c, def());
    for (let i = 0; i < 150; i++) w.step();
    expect(o.hp).toBeLessThan(hp);
    const bones = w.props.slice(n0);
    expect(bones.every((b) => b.z === 0)).toBe(true);
    expect(bones.some((b) => b.alive)).toBe(true);
  });

  it('stops adding to the litter once enough bones are lying about', () => {
    const w = flatBench();
    put(w.player, 300, 300, 0);
    put(w.cars[1]!, 400, 300, 0);
    for (let i = 0; i < 20; i++) grant(w, w.player, def());
    expect(w.props.filter((p) => p.def.id === 'prop.big-bone').length).toBeLessThanOrEqual(26);
  });

  it('is at every race venue', () => {
    for (const v of loadContent().venue.values())
      expect(v.pickups.includes('pickup.bone-shower')).toBe(v.mode === 'mode.race');
  });
});
