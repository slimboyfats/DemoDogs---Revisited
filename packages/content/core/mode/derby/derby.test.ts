import { describe, expect, it } from 'vitest';
import { ModeSchema } from '@demodogs/shared';
import { odds } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { makeWorld, put, runUntil, startRace } from '../../../src/testing';

/** Crates to fight with, crates to fight on behind, and the ones that only top a car up. */
const ARMS = new Set(['arms', 'blade']);
const COVER = new Set(['kit', 'shield', 'weld', 'plates', 'cage']);
const TOPUP = new Set(['ammo', 'nitro', 'jet', 'cash', 'springs', 'magnet']);

describe('mode.derby', () => {
  it('a wrecked car stays wrecked, and the player being wrecked ends the derby', () => {
    const w = startRace(makeWorld({ venue: 'venue.the-pit', rivals: 2 }));
    const r = w.cars[1]!;
    r.hp = 0;
    r.wrecked = true;
    runUntil(w, () => false, 60 * 5);
    expect(r.wrecked).toBe(true);
    w.player.wrecked = true;
    runUntil(w, (w) => w.phase === 'over', 60 * 5);
    expect(w.phase).toBe('over');
  });

  it('ends when time runs out', () => {
    const w = startRace(makeWorld({ venue: 'venue.the-pit', rivals: 1 }));
    w.timeLeft = 0.5;
    runUntil(w, (w) => w.phase === 'over', 60 * 5);
    expect(w.phase).toBe('over');
  });

  it('favours crates to fight with: weapons and defences far outnumber ammo, boost and cash', () => {
    const C = loadContent();
    const derby = C.mode.get('mode.derby')!;
    expect(derby.crates).toBeDefined();
    // a race keeps the venue's own mix
    expect(C.mode.get('mode.race')!.crates).toBeUndefined();
    for (const v of C.venue.values()) {
      if (v.mode !== 'mode.derby') continue;
      const kinds = v.pickups.map((id) => C.pickup.get(id)!);
      for (const hurt of [false, true]) {
        const share = (set: Set<string>, favours?: Record<string, number>) => {
          const total = kinds.reduce((s, k) => s + odds(k, hurt, 0.5, favours), 0);
          const part = kinds.filter((k) => set.has(k.kind));
          return part.reduce((s, k) => s + odds(k, hurt, 0.5, favours), 0) / total;
        };
        const fight = (f?: Record<string, number>) => share(ARMS, f) + share(COVER, f);
        expect(fight(derby.crates)).toBeGreaterThan(0.75);
        expect(fight(derby.crates)).toBeGreaterThan(fight());
        expect(share(TOPUP, derby.crates)).toBeLessThan(0.1);
        expect(share(COVER, derby.crates)).toBeGreaterThan(share(COVER));
        // the catch-up items are still there to roll
        expect(share(new Set(['grow', 'shrink']), derby.crates)).toBeGreaterThan(0.03);
      }
    }
  });

  it('what the crates in the bowl hand out follows that', () => {
    const w = startRace(makeWorld({ venue: 'venue.the-pit', rivals: 2, seed: 5 }));
    const c = w.player;
    w.pickups.length = 1;
    const p = w.pickups[0]!;
    let fight = 0;
    let topup = 0;
    let all = 0;
    for (let i = 0; i < 400; i++) {
      p.on = true;
      for (const o of w.cars) put(o, o.x, o.y, o.h, 0);
      c.hp = 100;
      p.x = c.x;
      p.y = c.y;
      p.z = c.deck;
      w.step();
      for (const e of w.takeEvents())
        if (e.t === 'pickup' && e.car === c.index) {
          all++;
          if (ARMS.has(e.kind) || COVER.has(e.kind)) fight++;
          if (TOPUP.has(e.kind)) topup++;
        }
    }
    expect(all).toBeGreaterThan(100);
    expect(fight / all).toBeGreaterThan(0.7);
    expect(topup / all).toBeLessThan(0.15);
  });

  it('a mode may only favour kinds of pickup that exist', () => {
    const derby = loadContent().mode.get('mode.derby')!;
    expect(ModeSchema.safeParse({ ...derby, crates: { arms: 2 } }).success).toBe(true);
    expect(ModeSchema.safeParse({ ...derby, crates: { marmalade: 2 } }).success).toBe(false);
    expect(ModeSchema.safeParse({ ...derby, crates: { arms: -1 } }).success).toBe(false);
  });
});
