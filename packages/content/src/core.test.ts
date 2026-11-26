import { describe, expect, it } from 'vitest';
import { NO_CONTROLS } from '@demodogs/shared';
import { Rng, putProp, stand } from '@demodogs/sim';
import { flatBench, makeWorld, testContent } from './testing';

const C = testContent();

describe('the lookup of static props', () => {
  it('finds a prop wider than any in the game from across its cells', () => {
    const w = flatBench();
    const def = { ...C.prop.get('prop.barrier')!, id: 'prop.test-wide', radius: 40 };
    // it stands just inside one cell, and is asked for from well inside the next
    const s = stand(w, def, 640 - 1, 400, 0, 0);
    expect(w.near(640 + 36, 400, 2)).toContain(s);
    expect(w.free(640 + 36, 400, 2)).toBe(false);
    expect(w.free(640 + 80, 400, 2)).toBe(true);
  });

  it('keeps what stands beyond the edge of the map', () => {
    const w = flatBench();
    const def = C.prop.get('prop.barrier')!;
    const s = stand(w, def, -30, -30, 0, 0);
    const t = stand(w, def, w.w + 500, w.h + 500, 0, 0);
    expect(w.near(-30, -30, 4)).toContain(s);
    expect(w.near(w.w + 500, w.h + 500, 4)).toContain(t);
  });

  it('starts again when the list is cut', () => {
    const w = makeWorld();
    expect(w.near(w.statics[0]!.x, w.statics[0]!.y, 2).length).toBeGreaterThan(0);
    w.statics.length = 0;
    expect(w.near(0, 0, 5000)).toEqual([]);
    const s = stand(w, C.prop.get('prop.barrier')!, 300, 300, 0, 0);
    expect(w.near(300, 300, 2)).toEqual([s]);
  });

  it('fills the list it is given, in the same order as a new one', () => {
    const w = makeWorld();
    const mine = [w.statics[0]!];
    const s = w.statics[Math.floor(w.statics.length / 2)]!;
    expect(w.near(s.x, s.y, 60, mine)).toBe(mine);
    expect(mine).toEqual(w.near(s.x, s.y, 60));
    expect(mine).toContain(s);
  });
});

describe('props at rest', () => {
  const drum = C.prop.get('prop.barrel')!;

  it('are passed by, and wake when something moves them', () => {
    const w = flatBench();
    putProp(w, drum, w.oval!.cx + 60, w.oval!.cy, 0, new Rng(1));
    const p = w.props[w.props.length - 1]!;
    for (let i = 0; i < 3; i++) w.step(NO_CONTROLS);
    expect(p.restN).toBe(w.stood);
    const x = p.x;
    p.vx = 90;
    for (let i = 0; i < 20; i++) w.step(NO_CONTROLS);
    expect(p.x).toBeGreaterThan(x + 10);
    // and one moved by hand, with no speed of its own, is looked at again
    p.vx = p.vy = p.spin = 0;
    p.x = w.oval!.cx + w.oval!.rx + 400;
    w.step(NO_CONTROLS);
    expect(p.x).toBeLessThan(w.oval!.cx + w.oval!.rx);
  });

  it('make room when scenery is stood where they lie', () => {
    const w = flatBench();
    const x = w.oval!.cx + 60;
    const y = w.oval!.cy;
    putProp(w, drum, x, y, 0, new Rng(1));
    const p = w.props[w.props.length - 1]!;
    for (let i = 0; i < 3; i++) w.step(NO_CONTROLS);
    expect(p.x).toBe(x);
    const wall = stand(w, C.prop.get('prop.barrier')!, x + 1, y, 0, 0);
    w.step(NO_CONTROLS);
    const clear = wall.def.radius + drum.radius;
    expect(Math.hypot(p.x - wall.x, p.y - wall.y)).toBeGreaterThanOrEqual(clear - 1e-6);
  });
});
