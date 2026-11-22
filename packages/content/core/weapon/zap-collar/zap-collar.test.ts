import { describe, expect, it } from 'vitest';
import { NO_CONTROLS, type SimEvent } from '@demodogs/shared';
import { loadContent } from '../../../src/index';
import { flatBench, put } from '../../../src/testing';

const C = loadContent();

describe('weapon.zap-collar', () => {
  it('chains from the car in front to the car beside it', () => {
    const w = flatBench({ rivals: 3 });
    const [x, y] = [w.oval!.cx, w.oval!.cy];
    const me = w.player;
    const [a, b, far] = w.cars.filter((c) => c !== me);
    for (const c of [a!, b!, far!]) c.ai = null;
    put(me, x - 60, y, 0);
    put(a!, x, y, 0);
    // behind the shooter, out of the first jump's sight but within reach of the first car
    put(b!, x - 20, y + 60, 0);
    put(far!, x + 300, y + 200, 0);
    me.weapon = C.weapon.get('weapon.zap-collar')!;
    me.ammo = 3;
    w.step({ ...NO_CONTROLS, fire: true });
    const arcs: Extract<SimEvent, { t: 'arc' }>[] = [];
    for (let i = 0; i < 40; i++) {
      w.step();
      for (const e of w.takeEvents()) if (e.t === 'arc') arcs.push(e);
    }
    expect(arcs.length).toBeGreaterThan(3);
    expect(arcs[0]!.pts.length).toBe(6);
    expect(a!.hp).toBeLessThan(100);
    expect(b!.hp).toBeLessThan(100);
    expect(a!.hp).toBeLessThan(b!.hp);
    expect(far!.hp).toBe(100);
    expect(w.arms.coils.length).toBe(0);
  });

  it('earths into the ground ahead with no one to strike', () => {
    const w = flatBench();
    const [x, y] = [w.oval!.cx, w.oval!.cy];
    put(w.player, x, y, 0);
    w.player.weapon = C.weapon.get('weapon.zap-collar')!;
    w.player.ammo = 1;
    w.step({ ...NO_CONTROLS, fire: true });
    w.step();
    const arc = w.takeEvents().find((e) => e.t === 'arc') as Extract<SimEvent, { t: 'arc' }>;
    expect(arc.pts.length).toBe(4);
    expect(arc.pts[2]!).toBeGreaterThan(x + 30);
  });
});
