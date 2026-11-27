import { DT } from '@demodogs/shared';
import { belowRoad, rampAhead, thingsAhead, wantsFire } from '@demodogs/sim';
import { describe, expect, it } from 'vitest';
import { bench, makeWorld, put, runUntil, startRace } from '../../../src/testing';

describe('ai.racer', () => {
  it('gets round the track: a lap within 50 seconds', () => {
    const w = makeWorld({ autopilot: true, rivals: 0 });
    w.bots.length = 0;
    runUntil(w, (w) => w.player.lap >= 2, 60 * 54);
    expect(w.player.lap).toBeGreaterThanOrEqual(2);
  });

  it('a whole field laps without anybody left stuck or off the road for long', () => {
    // (a seed where no car spends the minute beached: one in three has one that does)
    const w = startRace(makeWorld({ autopilot: true, laps: 9, seed: 5 }));
    let off = 0;
    let slow = 0;
    let n = 0;
    for (let t = 0; t < 60 * 60; t++) {
      w.step();
      for (const c of w.cars) {
        if (c.wrecked) continue;
        n++;
        if (c.offroad) off++;
        if (Math.abs(c.vf) < 12 && w.time > 6) slow++;
      }
    }
    // (a car that pushes on runs wide: on a road as narrow as the bench's a wheel is on the
    // grass now and then)
    expect(off / n).toBeLessThan(0.05);
    expect(slow / n).toBeLessThan(0.03);
    expect(Math.min(...w.cars.map((c) => c.lap))).toBeGreaterThanOrEqual(1);
  });

  it('goes round a wreck lying on its line', () => {
    const w = bench({ autopilot: true, rivals: 1 });
    const c = w.player;
    const o = w.cars.find((k) => k !== c)!;
    const T = w.track!;
    // dead ahead on the racing line, 160 px on
    const i = (c.idx + 40) % T.n;
    put(o, w.line!.x[i]!, w.line!.y[i]!, T.a[i]!);
    o.wrecked = true;
    o.idx = i;
    let hit = false;
    for (let t = 0; t < 60 * 4; t++) {
      w.step();
      put(o, w.line!.x[i]!, w.line!.y[i]!, T.a[i]!);
      if (w.takeEvents().some((e) => e.t === 'crash')) hit = true;
    }
    expect(hit).toBe(false);
    expect(c.progress).toBeGreaterThan(T.s[i]!);
  });

  it('turns round when it is facing the wrong way', () => {
    const w = bench({ autopilot: true });
    const c = w.player;
    const T = w.track!;
    const from = c.progress;
    put(c, T.x[c.idx]!, T.y[c.idx]!, T.a[c.idx]! + Math.PI);
    runUntil(w, () => c.progress > from + 150, 60 * 8);
    expect(c.progress).toBeGreaterThan(from + 150);
  });

  it('backs out when its nose is against something', () => {
    const w = bench({ autopilot: true });
    const c = w.player;
    const ai = c.ai!;
    let backed = false;
    for (let t = 0; t < 60 * 3; t++) {
      // held where it is: pushing and getting nowhere
      const [x, y, h] = [c.x, c.y, c.h];
      w.step();
      put(c, x, y, h);
      if (ai.revT > 0) backed = true;
    }
    expect(backed).toBe(true);
    expect(ai.tries).toBeGreaterThan(0);
  });

  it('sees a mine ahead as something to keep off and a crate as something to go for', () => {
    const w = bench({ autopilot: true });
    const c = w.player;
    const ax = c.x + Math.cos(c.h) * 60;
    const ay = c.y + Math.sin(c.h) * 60;
    const def = [...w.content.weapon.values()].find((d) => d.kind === 'mine')!;
    w.mines.push({ x: ax, y: ay, z: 0, owner: 3, t: 0, def });
    w.pickups.length = 0;
    w.pickups.push({ x: ax + 20, y: ay, z: 0, on: true, t: 0 });
    const things = thingsAhead(w, c, 120);
    expect(things.some((k) => k.w > 0 && k.x === ax)).toBe(true);
    expect(things.some((k) => k.w < 0 && k.x === ax + 20)).toBe(true);
    // its own mine is no danger to it
    w.mines[0]!.owner = c.index;
    expect(thingsAhead(w, c, 120).some((k) => k.w > 0 && k.x === ax)).toBe(false);
  });

  it('fires a rocket at a car in front and holds it on an empty road', () => {
    const w = bench({ autopilot: true, rivals: 1 });
    const c = w.player;
    const o = w.cars.find((k) => k !== c)!;
    const rocket = [...w.content.weapon.values()].find((d) => d.kind === 'rocket')!;
    c.weapon = rocket;
    c.ammo = 1;
    put(o, c.x - Math.cos(c.h) * 300, c.y - Math.sin(c.h) * 300, c.h);
    c.ai!.aimT = 0;
    expect(wantsFire(w, c)).toBe(false);
    put(o, c.x + Math.cos(c.h) * 90, c.y + Math.sin(c.h) * 90, c.h);
    let fired = false;
    for (let t = 0; t < 30 && !fired; t++) fired = wantsFire(w, c);
    expect(fired).toBe(true);
  });

  it('drops what it carries behind it only with a car on its tail, or when it has carried it long', () => {
    const w = bench({ autopilot: true, rivals: 1 });
    const c = w.player;
    const o = w.cars.find((k) => k !== c)!;
    c.weapon = [...w.content.weapon.values()].find((d) => d.kind === 'mine')!;
    c.ammo = 1;
    put(o, c.x + Math.cos(c.h) * 400, c.y + Math.sin(c.h) * 400, c.h);
    put(c, c.x, c.y, c.h, 100);
    expect(wantsFire(w, c)).toBe(false);
    put(o, c.x - Math.cos(c.h) * 40, c.y - Math.sin(c.h) * 40, c.h);
    let dropped = false;
    for (let t = 0; t < 30 && !dropped; t++) dropped = wantsFire(w, c);
    expect(dropped).toBe(true);
    // nobody about, but it has had it for ages
    put(o, c.x + Math.cos(c.h) * 400, c.y + Math.sin(c.h) * 400, c.h);
    c.ai!.heldT = 30;
    c.ai!.aimT = 0;
    dropped = false;
    for (let t = 0; t < 30 && !dropped; t++) dropped = wantsFire(w, c);
    expect(dropped).toBe(true);
  });

  it('lines up with a ramp that lies ahead', () => {
    const w = bench({ autopilot: true });
    const c = w.player;
    expect(rampAhead(w, c, 80)).toBeNull();
    const def = [...w.content.prop.values()].find((p) => p.pad?.kind === 'jump')!;
    const x = c.x + Math.cos(c.h) * 50;
    const y = c.y + Math.sin(c.h) * 50;
    const s = { index: w.statics.length, def, made: null, x, y, rot: c.h, seed: 0 };
    w.statics.push(s);
    w.pads.push(s);
    const aim = rampAhead(w, c, 80)!;
    expect(Math.hypot(aim[0] - x, aim[1] - y)).toBeCloseTo(44, 0);
    // one that points the other way is not a ramp to take
    s.rot = c.h + Math.PI;
    expect(rampAhead(w, c, 80)).toBeNull();
  });

  it('is on level ground on the bench: nothing to climb back up to', () => {
    const w = bench({ autopilot: true });
    expect(belowRoad(w, w.player)).toBe(0);
  });

  it('each driver is a kind of its own, the same kind every race', () => {
    const kinds = (seed: number) =>
      new Map(
        makeWorld({ seed })
          .cars.filter((c) => c.ai)
          .map((c) => [c.name, c.ai!.style]),
      );
    const a = kinds(1);
    const b = kinds(2);
    expect(new Set(a.values()).size).toBeGreaterThan(1);
    for (const [name, kind] of a) if (b.has(name)) expect(b.get(name)).toBe(kind);
    const styles = makeWorld().content.ai.get('ai.racer')!.styles!;
    for (const s of styles) for (const d of s.drivers) if (a.has(d)) expect(a.get(d)).toBe(s.name);
  });

  it('hard rivals get further than easy ones in the same time', () => {
    const far = (difficulty: 'easy' | 'hard') => {
      const w = startRace(makeWorld({ difficulty, laps: 9, seed: 5 }));
      for (let t = 0; t < 60 * 40; t++)
        w.step({ steer: 0, throttle: 0, brake: true, boost: false, fire: false });
      const rivals = w.cars.filter((c) => c.ai);
      return rivals.reduce((s, c) => s + c.progress, 0) / rivals.length;
    };
    expect(far('hard')).toBeGreaterThan(far('easy') * 1.04);
  });

  it('a whole race is the same race twice (lockstep)', () => {
    const run = () => {
      const w = makeWorld({ autopilot: true, seed: 9 });
      for (let t = 0; t < 60 * 30; t++) w.step();
      return w.hash();
    };
    expect(run()).toBe(run());
    expect(DT).toBeCloseTo(1 / 60);
  });
});
