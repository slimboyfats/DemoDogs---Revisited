import { describe, expect, it } from 'vitest';
import { NO_CONTROLS } from '@demodogs/shared';
import { armed, put } from '../../../src/testing';

describe('weapon.pit-stop', () => {
  it('in a derby the car following tips in nose first and is buried for good', () => {
    const { w, me, rivals, def, x, y, run } = armed('weapon.pit-stop');
    const t = rivals[0]!;
    put(me, x, y, 0);
    put(t, x - 90, y, 0);
    const events = run(1, { ...NO_CONTROLS, fire: true });
    expect(events.find((e) => e.t === 'pit')).toMatchObject({ r: def.radius, life: def.life });
    const h = { ...w.wild.holes[0]! };
    expect(h.x).toBeLessThan(me.x - def.radius!);
    expect(h.y).toBeCloseTo(y);
    // the car behind drives straight at it
    t.vx = 120;
    const score = me.score;
    for (let i = 0; i < 90; i++) events.push(...run(1));
    expect(events.find((e) => e.t === 'trap')).toMatchObject({ car: t.index, gone: true });
    expect(events.find((e) => e.t === 'buried')).toMatchObject({ car: t.index, by: me.index });
    expect(events.some((e) => e.t === 'wreck')).toBe(false);
    expect(t.wrecked && t.buried).toBe(true);
    expect(t.sunkTip![0]).toBeGreaterThan(0.9);
    expect(Math.hypot(t.x - h.x, t.y - h.y)).toBeLessThan(2);
    expect(me.score).toBeGreaterThan(score);
    // the hole has had its car and closes
    expect(w.wild.holes.length).toBe(0);
    expect(events.find((e) => e.t === 'fill')).toMatchObject({ x: h.x, y: h.y });
    expect(me.hp).toBe(100);
  });

  it('in a race the car goes down, takes the knock and is thrown back out', () => {
    const { w, me, rivals, def, x, y, run } = armed('weapon.pit-stop');
    // the same flat ground, run under race rules
    (w as { mode: typeof w.mode }).mode = { ...w.mode, kind: 'race' };
    const t = rivals[0]!;
    put(me, x, y, 0);
    put(t, x - 200, y + 100, 0);
    const events = run(1, { ...NO_CONTROLS, fire: true });
    const h = w.wild.holes[0]!;
    put(t, h.x - 4, h.y, Math.PI / 2);
    t.vx = 0;
    t.vy = 0;
    events.push(...run(20));
    expect(events.find((e) => e.t === 'trap')).toMatchObject({ car: t.index, gone: false });
    expect(t.sunk).toBeGreaterThan(1);
    expect(t.wrecked).toBe(false);
    expect(t.hp).toBeLessThan(100);
    expect(Math.hypot(t.x - h.x, t.y - h.y)).toBeLessThan(2);
    // nothing can hit it down there
    expect(t.invuln).toBeGreaterThan(0);
    let top = 0;
    for (let i = 0; i < def.stall! * 60 + 20; i++) {
      events.push(...run(1));
      top = Math.max(top, t.z - t.deck);
    }
    expect(events.find((e) => e.t === 'unpit')).toMatchObject({ car: t.index });
    expect(t.sunk).toBe(0);
    expect(top).toBeGreaterThan(5);
    // it went in sideways: right side first
    expect(t.sunkTip![1]).toBeLessThan(-0.9);
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
    expect(me.buried).toBe(true);
  });
});
