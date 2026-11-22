import { NO_CONTROLS } from '@demodogs/shared';
import {
  rangeBlast,
  rangeGive,
  rangeHit,
  rangeMend,
  rangeMine,
  rangeMove,
  rangeProp,
  rangeRocket,
  rangeWreck,
} from '@demodogs/sim';
import { describe, expect, it } from 'vitest';
import { loadContent } from './index';
import { makeWorld } from './testing';

const range = () => makeWorld({ venue: 'venue.the-pit', sandbox: true, rivals: 2 });

describe('the test range', () => {
  it('starts live, never ends, and nobody drives the parked cars', () => {
    const w = range();
    expect(w.phase).toBe('race');
    const [a, b] = w.cars.filter((c) => c !== w.player);
    const at = [a!.x, a!.y, b!.x, b!.y];
    for (let i = 0; i < 60 * 200; i++) w.step({ ...NO_CONTROLS, throttle: 1 });
    expect(w.phase).toBe('race');
    expect([a!.x, a!.y, b!.x, b!.y]).toEqual(at);
    expect(Math.hypot(w.player.vx, w.player.vy)).toBeGreaterThan(0);
  });

  it('a blast hurts and throws a car, and it can be mended', () => {
    const w = range();
    const t = w.cars.find((c) => c !== w.player)!;
    rangeBlast(w, t.x + 4, t.y, 1);
    expect(t.hp).toBeLessThan(100);
    expect(w.takeEvents().some((e) => e.t === 'explode')).toBe(true);
    rangeHit(w, t, 20, t.x, t.y);
    rangeWreck(w, t);
    expect(t.wrecked).toBe(true);
    rangeMend(w, t);
    expect(t.wrecked).toBe(false);
    expect(t.hp).toBe(100);
    expect(w.takeEvents().some((e) => e.t === 'respawn')).toBe(true);
  });

  it('a rocket fired at a parked car blows up on it; a mine goes off under a car put on it', () => {
    const w = range();
    const P = w.player;
    const t = w.cars.find((c) => c !== P)!;
    rangeMove(t, P.x + 80, P.y);
    const rocket = [...w.content.weapon.values()].find((d) => d.kind === 'rocket')!;
    rangeRocket(w, rocket, P, P.x + 15, P.y, 0);
    for (let i = 0; i < 60 && w.rockets.length; i++) w.step();
    expect(w.rockets.length).toBe(0);
    expect(t.hp).toBeLessThan(100);
    rangeMend(w, t);
    const mine = [...w.content.weapon.values()].find((d) => d.kind === 'mine')!;
    rangeMine(w, mine, P, P.x - 200, P.y);
    rangeMove(t, P.x - 200, P.y);
    w.step();
    expect(w.mines.length).toBe(0);
    expect(t.hp).toBeLessThan(100);
  });

  it('props are put down as scenery or as loose things', () => {
    const w = range();
    const s = w.statics.length;
    const p = w.props.length;
    for (const def of w.content.prop.values()) rangeProp(w, def, w.player.x + 100, w.player.y);
    expect(w.statics.length).toBeGreaterThan(s);
    expect(w.props.length).toBeGreaterThan(p);
    expect(w.props.at(-1)!.index).toBe(w.props.length - 1);
  });

  it('hands a car any pickup, shields and welders too', () => {
    const w = range();
    const t = w.cars.find((c) => c !== w.player)!;
    for (const p of loadContent().pickup.values()) rangeGive(w, t, p);
    expect(t.shield).toBeGreaterThan(0);
    expect(w.takeEvents().filter((e) => e.t === 'pickup').length).toBe(loadContent().pickup.size);
    rangeWreck(w, t);
    rangeGive(w, t, loadContent().pickup.get('pickup.dome')!);
    expect(w.takeEvents().some((e) => e.t === 'pickup')).toBe(false);
  });
});
