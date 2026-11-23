import { NO_CONTROLS } from '@demodogs/shared';
import { arsenalWants, flailAt, fleaAt, isArsenal, rangeArsenal } from '@demodogs/sim';
import { describe, expect, it } from 'vitest';
import { loadContent } from './index';
import { armed, makeWorld, put } from './testing';

const C = loadContent();
const TEN = [...C.weapon.values()].filter((d) => isArsenal(d.kind));

describe('the odd arms', () => {
  it('are sixteen kinds, all in the arms crate', () => {
    expect(new Set(TEN.map((d) => d.kind)).size).toBe(16);
    const crate = C.pickup.get('pickup.arms')!.weapons!;
    for (const d of TEN) expect(crate).toContain(d.id);
  });

  it('an AI driver uses each when a rival is where it works, and not otherwise', () => {
    for (const d of TEN) {
      const { w, me, rivals, x, y } = armed(d.id);
      const t = rivals[0]!;
      put(me, x, y, 0);
      // nobody near
      put(t, x - 300, y + 200, 0);
      expect(arsenalWants(w, me), `${d.id} idle`).toBe(false);
      const behind = d.kind === 'sentry' || d.kind === 'trail' || d.kind === 'pit';
      if (d.kind === 'meteor') {
        // called down now and then, on any car left in a derby
        let asked = false;
        for (let i = 0; i < 400 && !asked; i++) asked = arsenalWants(w, me);
        expect(asked).toBe(true);
        continue;
      }
      put(t, x + (behind ? -50 : d.kind === 'flail' || d.kind === 'frost' ? 30 : 60), y, 0);
      if (d.kind === 'swap') {
        // only for the place of a car further round a race
        expect(arsenalWants(w, me)).toBe(false);
        continue;
      }
      expect(arsenalWants(w, me), d.id).toBe(true);
      me.fireCd = 1;
      expect(arsenalWants(w, me)).toBe(false);
    }
    const w = makeWorld({ rivals: 1 });
    const me = w.player;
    const t = w.cars.find((c) => c !== me)!;
    me.weapon = C.weapon.get('weapon.switcheroo')!;
    put(t, me.x + Math.cos(me.h) * 60, me.y + Math.sin(me.h) * 60, me.h);
    t.progress = me.progress + 60;
    expect(arsenalWants(w, me)).toBe(true);
    t.progress = me.progress - 60;
    expect(arsenalWants(w, me)).toBe(false);
  });

  it('in the test range each is fired at the spot tapped', () => {
    for (const d of TEN) {
      const { w, me, x, y, run } = armed(d.id, 0);
      put(me, x, y, 0);
      rangeArsenal(w, d, me, x, y + 80);
      expect(me.h).toBeCloseTo(Math.PI / 2);
      const K = w.arsenal;
      const n =
        Object.values(K).reduce((a, l) => a + l.length, 0) +
        Object.values(w.wild).reduce((a, l) => a + l.length, 0) +
        w.spills.length;
      expect(n, d.id).toBeGreaterThan(0);
      if (d.kind === 'sentry') expect(K.sentries[0]).toMatchObject({ x, y: y + 80 });
      if (d.kind === 'barrage') {
        const ys = K.strikes.map((s) => s.y);
        expect(Math.min(...ys)).toBeLessThan(y + 80);
        expect(Math.max(...ys)).toBeGreaterThan(y + 80);
      }
      if (d.kind === 'pit') expect(w.wild.holes[0]).toMatchObject({ x, y: y + 80 });
      if (d.kind === 'twister') expect(w.wild.twisters[0]).toMatchObject({ x, y: y + 80 });
      if (d.kind === 'meteor') expect(w.wild.bones[0]).toMatchObject({ x, y: y + 80, target: -1 });
      if (d.kind === 'flail') expect(flailAt(w, w.wild.flails[0]!)[1]).toBeLessThan(y);
      if (d.kind === 'swarm')
        expect(fleaAt(w, K.fleas[0]!)).toEqual([K.fleas[0]!.x, K.fleas[0]!.y]);
      expect(run(1).find((e) => e.t === 'fire')).toMatchObject({ weapon: d.id });
    }
  });

  it('a flea on a car is carried with it', () => {
    const { w, me, rivals, x, y, run } = armed('weapon.fleas');
    put(me, x - 30, y, 0);
    put(rivals[0]!, x + 20, y, 0);
    run(1, { ...NO_CONTROLS, fire: true });
    run(60);
    const f = w.arsenal.fleas.find((f) => f.host >= 0)!;
    const [fx, fy] = fleaAt(w, f);
    expect(Math.hypot(fx - rivals[0]!.x, fy - rivals[0]!.y)).toBeLessThan(12);
  });

  it('a race where every car keeps firing them runs the same twice', () => {
    const race = () => {
      const w = makeWorld({ venue: 'venue.the-pit', rivals: 5, seed: 11, autopilot: true });
      for (let i = 0; i < 60 * 30; i++) {
        if (i % 45 === 0)
          w.cars.forEach((c, k) => {
            if (c.wrecked || c.weapon) return;
            c.weapon = TEN[(k + i / 45) % TEN.length]!;
            c.ammo = c.weapon.ammo;
          });
        w.step();
      }
      return w.hash();
    };
    expect(race()).toBe(race());
  });
});
