import { describe, expect, it } from 'vitest';
import { DT, NO_CONTROLS, type Controls, type SimEvent } from '@demodogs/shared';
import {
  away,
  canHaunt,
  haunting,
  HAUNT_AFTER,
  HAUNT_REST,
  rangeWreck,
  type World,
} from '@demodogs/sim';
import { makeWorld, put, runUntil } from './testing';

const GAS: Controls = { ...NO_CONTROLS, throttle: 1 };

/** A derby past the countdown: one driver (or two), the rivals parked out of the way of the test. */
function derby(opts: Parameters<typeof makeWorld>[0] = {}): World {
  const w = makeWorld({ venue: 'venue.bench-pit', seed: 3, playOn: true, ...opts });
  runUntil(w, (x) => x.phase === 'race', 60 * 20);
  w.props.length = 0;
  w.bots.length = 0;
  w.critters.length = 0;
  // only the arena's wall is left standing
  for (const s of w.statics) if (s.def.id !== 'prop.block') s.down = true;
  return w;
}

/** Run `seconds` with the player's controls, the rivals not driving; every event that came out. */
function run(w: World, seconds: number, ctl: Controls = NO_CONTROLS): SimEvent[] {
  const out: SimEvent[] = [];
  for (let t = 0; t < seconds; t += DT) {
    for (const c of w.cars) if (c.ai) c.ai = null;
    w.step(ctl);
    out.push(...w.takeEvents());
  }
  return out;
}

/** Scrap the player out in the open middle of the arena and let the wreck come to rest. */
function scrap(w: World): void {
  const P = w.player;
  put(P, w.w / 2, w.h / 2, 0);
  // the rivals stand well away
  w.cars.forEach((c, i) => {
    if (c !== P) put(c, w.w / 2 - 200 + i * 20, w.h / 2 + 200, 0);
  });
  rangeWreck(w, P);
  run(w, HAUNT_AFTER + 0.5);
}

describe('a ghost car', () => {
  it('is only for a driver who is out for good', () => {
    const w = derby();
    expect(canHaunt(w, w.player)).toBe(false);
    rangeWreck(
      w,
      w.cars.find((c) => !c.isPlayer)!,
    );
    expect(w.cars.some((c) => canHaunt(w, c))).toBe(false);
    rangeWreck(w, w.player);
    expect(canHaunt(w, w.player)).toBe(true);
    // in a race a wreck is towed back: there is no ghost of it
    const r = makeWorld();
    runUntil(r, (x) => x.phase === 'race', 60 * 20);
    rangeWreck(r, r.player);
    expect(canHaunt(r, r.player)).toBe(false);
  });

  it('stays a wreck until its driver touches the controls', () => {
    const w = derby();
    scrap(w);
    const P = w.player;
    const x = P.x;
    const ev = run(w, 3);
    expect(P.haunt).toBeUndefined();
    expect(ev.some((e) => e.t === 'haunt')).toBe(false);
    expect(P.x).toBeCloseTo(x, 0);
  });

  it('gets up on the gas, a moment after the wreck, and drives', () => {
    const w = derby();
    const P = w.player;
    put(P, w.w / 2, w.h / 2, 0);
    rangeWreck(w, P);
    // too soon: the wreck is still coming down
    run(w, HAUNT_AFTER / 2, GAS);
    expect(P.haunt).toBeUndefined();
    const ev = run(w, HAUNT_AFTER, GAS);
    expect(ev).toContainEqual({ t: 'haunt', car: P.index, on: true });
    expect(haunting(P)).toBe(true);
    const x = P.x;
    run(w, 2, GAS);
    expect(Math.hypot(P.x - x, P.y - w.h / 2)).toBeGreaterThan(80);
    // and it is still a wreck to every rule
    expect(P.wrecked).toBe(true);
    expect(P.hp).toBe(0);
    expect(w.standings().at(-1)).toBe(P);
  });

  it('shoves a running car and never hurts it', () => {
    const w = derby();
    scrap(w);
    const P = w.player;
    const o = w.cars.find((c) => !c.isPlayer)!;
    put(P, w.w / 2 - 160, w.h / 2, 0);
    run(w, 0.1, GAS);
    put(o, w.w / 2 + 40, w.h / 2, Math.PI / 2);
    const hp = o.hp;
    const ox = o.x;
    const ev = run(w, 4, GAS);
    expect(ev.some((e) => e.t === 'spook' && e.ghost === P.index && e.car === o.index)).toBe(true);
    expect(o.x).toBeGreaterThan(ox + 10);
    expect(o.hp).toBe(hp);
    expect(ev.some((e) => e.t === 'hit' || e.t === 'wreck')).toBe(false);
    expect(P.score).toBe(0);
  });

  it('goes through wrecks and what lies loose, and breaks nothing', () => {
    const w = derby();
    scrap(w);
    const P = w.player;
    const o = w.cars.find((c) => !c.isPlayer)!;
    put(P, w.w / 2 - 120, w.h / 2, 0);
    run(w, 0.1, GAS);
    put(o, w.w / 2, w.h / 2, Math.PI / 2);
    rangeWreck(w, o);
    const down = w.statics.filter((s) => s.down).length;
    run(w, 1.2);
    const ox = o.x;
    const oy = o.y;
    put(P, o.x - 120, o.y, 0);
    run(w, 3, GAS);
    expect(P.x).toBeGreaterThan(ox + 20);
    expect(Math.hypot(o.x - ox, o.y - oy)).toBeLessThan(1);
    // flat out into the arena's wall: it stops there and the wall stands
    run(w, 8, GAS);
    expect(w.statics.filter((s) => s.down).length).toBe(down);
  });

  it('goes away when it is left alone, and comes back when asked', () => {
    const w = derby();
    scrap(w);
    const P = w.player;
    run(w, 1, GAS);
    expect(haunting(P)).toBe(true);
    const ev = run(w, HAUNT_REST + 3);
    expect(ev).toContainEqual({ t: 'haunt', car: P.index, on: false });
    expect(away(P)).toBe(true);
    // a car driven over the spot meets nothing
    const o = w.cars.find((c) => !c.isPlayer)!;
    put(o, P.x - 60, P.y, 0, 120);
    const hp = o.hp;
    const vx = o.vx;
    for (let i = 0; i < 40; i++) w.step();
    expect(o.x).toBeGreaterThan(P.x + 5);
    expect(o.hp).toBe(hp);
    expect(o.vx).toBeGreaterThan(vx * 0.5);
    const back = run(w, 0.5, GAS);
    expect(back).toContainEqual({ t: 'haunt', car: P.index, on: true });
  });

  it('does not keep a derby going: the last car running still wins it', () => {
    const w = derby();
    scrap(w);
    run(w, 1, GAS);
    const rivals = w.cars.filter((c) => !c.isPlayer);
    for (const c of rivals.slice(1)) rangeWreck(w, c);
    run(w, 3, GAS);
    expect(w.phase).toBe('over');
    expect(w.standings()[0]).toBe(rivals[0]);
  });

  it('is the same on every screen of an online derby', () => {
    const humans = [{ car: 'car.pug', name: 'GUEST', paint: '#3fa9f5' }];
    const a = derby({ humans, you: 0 });
    const b = derby({ humans, you: 1 });
    rangeWreck(a, a.humans[1]!);
    rangeWreck(b, b.humans[1]!);
    for (let i = 0; i < 60 * 12; i++) {
      const guest: Controls =
        i > 150 && i < 500 ? { ...GAS, steer: Math.sin(i * 0.05) } : NO_CONTROLS;
      const host: Controls = { ...GAS, steer: Math.cos(i * 0.03) * 0.5 };
      a.stepSeats([host, guest]);
      b.stepSeats([host, guest]);
      a.takeEvents();
      b.takeEvents();
      if (i % 30 === 0) expect(a.hash()).toBe(b.hash());
    }
    expect(a.hash()).toBe(b.hash());
    expect(a.humans[1]!.haunt).toBeDefined();
  });
});
