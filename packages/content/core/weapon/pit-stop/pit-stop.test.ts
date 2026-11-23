import { describe, expect, it } from 'vitest';
import { NO_CONTROLS } from '@demodogs/shared';
import { armed, put } from '../../../src/testing';

describe('weapon.pit-stop', () => {
  it('digs a hole behind the car that swallows the car following', () => {
    const { w, me, rivals, def, x, y, run } = armed('weapon.pit-stop');
    const t = rivals[0]!;
    put(me, x, y, 0);
    put(t, x - 90, y, 0);
    const events = run(1, { ...NO_CONTROLS, fire: true });
    const pit = events.find((e) => e.t === 'pit')!;
    expect(pit).toMatchObject({ r: def.radius, life: def.life });
    const h = w.wild.holes[0]!;
    expect(h.x).toBeLessThan(me.x - def.radius!);
    expect(h.y).toBeCloseTo(y);
    // the car behind drives straight at it
    t.vx = 120;
    for (let i = 0; i < 60; i++) events.push(...run(1));
    expect(events.find((e) => e.t === 'trap')).toMatchObject({ car: t.index });
    expect(events.find((e) => e.t === 'hit')).toMatchObject({ car: t.index, by: me.index });
    expect(t.hp).toBeLessThan(100);
    expect(Math.hypot(t.x - h.x, t.y - h.y)).toBeLessThan(def.radius!);
    expect(Math.hypot(t.vx, t.vy)).toBeLessThan(20);
    expect(me.hp).toBe(100);
  });

  it('lets a car in the air sail over, and fills itself in', () => {
    const { w, me, rivals, def, x, y, run } = armed('weapon.pit-stop');
    const t = rivals[0]!;
    put(me, x, y, 0);
    put(t, x - 200, y + 150, 0);
    run(1, { ...NO_CONTROLS, fire: true });
    const h = w.wild.holes[0]!;
    put(t, h.x, h.y, 0);
    t.z = 12;
    t.vz = 60;
    const events = run(3);
    expect(events.some((e) => e.t === 'trap')).toBe(false);
    put(t, x - 200, y + 150, 0);
    for (let i = 0; i < def.life! * 60 + 5; i++) events.push(...run(1));
    expect(w.wild.holes.length).toBe(0);
    expect(events.find((e) => e.t === 'fill')).toMatchObject({ x: h.x, y: h.y });
  });

  it('catches the one who dug it too, once they have had time to get clear', () => {
    const { w, me, rivals, x, y, run } = armed('weapon.pit-stop');
    put(me, x, y, 0);
    put(rivals[0]!, x - 200, y + 150, 0);
    run(1, { ...NO_CONTROLS, fire: true });
    const h = w.wild.holes[0]!;
    put(me, h.x, h.y, 0);
    expect(run(30).some((e) => e.t === 'trap')).toBe(false);
    expect(run(60).find((e) => e.t === 'trap')).toMatchObject({ car: me.index });
    expect(me.hp).toBeLessThan(100);
  });
});
