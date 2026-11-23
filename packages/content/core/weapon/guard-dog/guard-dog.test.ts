import { describe, expect, it } from 'vitest';
import { NO_CONTROLS } from '@demodogs/shared';
import { armed, put } from '../../../src/testing';

describe('weapon.guard-dog', () => {
  it('is set down behind the car and shoots the rival that comes near', () => {
    const { w, me, rivals, x, y, run } = armed('weapon.guard-dog');
    const t = rivals[0]!;
    put(me, x, y, 0);
    put(t, x - 80, y + 40, 0);
    const events = run(1, { ...NO_CONTROLS, fire: true });
    const s = w.arsenal.sentries[0]!;
    expect(s.x).toBeLessThan(me.x);
    expect(events.find((e) => e.t === 'sentry')).toMatchObject({ what: 'up' });
    put(me, x + 200, y, 0);
    events.push(...run(180));
    const shots = events.filter((e) => e.t === 'shot');
    expect(shots.length).toBeGreaterThan(5);
    expect(t.hp).toBeLessThan(100);
    expect(me.hp).toBe(100);
    expect(s.rounds).toBeLessThan(40);
  });

  it('sweeps when nobody is near, and packs up when its time is out', () => {
    const { w, me, def, x, y, run } = armed('weapon.guard-dog', 0);
    put(me, x, y, 0);
    run(1, { ...NO_CONTROLS, fire: true });
    put(me, x + 220, y, 0);
    const h = w.arsenal.sentries[0]!.h;
    const events = run(30);
    expect(w.arsenal.sentries[0]!.h).not.toBe(h);
    events.push(...run(Math.ceil(def.life! * 60)));
    expect(w.arsenal.sentries.length).toBe(0);
    expect(events.find((e) => e.t === 'sentry' && e.what === 'spent')).toBeTruthy();
  });

  it('blows up under a car that runs it over', () => {
    const { w, me, rivals, x, y, run } = armed('weapon.guard-dog');
    const t = rivals[0]!;
    put(me, x, y, 0);
    put(t, x + 250, y, 0);
    run(1, { ...NO_CONTROLS, fire: true });
    const s = w.arsenal.sentries[0]!;
    put(me, x + 200, y + 100, 0);
    put(t, s.x, s.y, 0);
    const events = run(2);
    expect(w.arsenal.sentries.length).toBe(0);
    expect(events.find((e) => e.t === 'sentry' && e.what === 'crushed')).toBeTruthy();
    expect(events.map((e) => e.t)).toContain('explode');
    expect(t.hp).toBeLessThan(100);
  });
});
