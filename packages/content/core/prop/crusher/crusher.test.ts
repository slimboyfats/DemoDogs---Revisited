import { describe, expect, it } from 'vitest';
import { pressOpen, pressWarning, stand } from '@demodogs/sim';
import { flatBench, put } from '../../../src/testing';
import { loadContent } from '../../../src/index';

const setup = () => {
  const w = flatBench();
  const def = loadContent().prop.get('prop.crusher')!;
  const s = stand(w, def, w.oval!.cx, w.oval!.cy, 0, 0);
  return { w, s, P: def.press! };
};

describe('prop.crusher', () => {
  it('can be driven across: the bed is not in the way', () => {
    const { w, s } = setup();
    const c = w.player;
    put(c, s.x - 40, s.y, 0, 120);
    for (let i = 0; i < 40; i++)
      w.step({ steer: 0, throttle: 1, brake: false, boost: false, fire: false });
    expect(c.x).toBeGreaterThan(s.x + 10);
  });

  it('rises, stays open, shudders, then slams shut on its beat', () => {
    const { w, s, P } = setup();
    const seen: number[] = [];
    let warned = false;
    for (let i = 0; i < Math.ceil((P.period * 2) / (1 / 60)); i++) {
      w.step();
      seen.push(pressOpen(w, s));
      if (pressWarning(w, s)) warned = true;
      for (const e of w.takeEvents()) if (e.t === 'press') seen.push(-1);
    }
    expect(seen.filter((v) => v === -1).length).toBeGreaterThanOrEqual(2);
    expect(Math.max(...seen)).toBe(1);
    expect(seen).toContain(0);
    expect(warned).toBe(true);
  });

  it('flattens a car parked under it', () => {
    const { w, s, P } = setup();
    const c = w.player;
    put(c, s.x, s.y, 0);
    const hp = c.hp;
    let slams = 0;
    for (let i = 0; i < Math.ceil(P.period * 60) + 2; i++) {
      w.step();
      for (const e of w.takeEvents()) if (e.t === 'press' && e.caught === 1) slams++;
    }
    expect(slams).toBe(1);
    expect(c.hp).toBeLessThan(hp - 40);
  });

  it('leaves a car beside it alone', () => {
    const { w, s, P } = setup();
    const c = w.player;
    put(c, s.x, s.y + 30, 0);
    const hp = c.hp;
    for (let i = 0; i < Math.ceil(P.period * 60) + 2; i++) w.step();
    expect(c.hp).toBe(hp);
  });

  it('stops for good once it is wrecked', () => {
    const { w, s, P } = setup();
    s.down = true;
    const c = w.player;
    put(c, s.x, s.y, 0);
    const hp = c.hp;
    for (let i = 0; i < Math.ceil(P.period * 60) + 2; i++) w.step();
    expect(c.hp).toBe(hp);
  });
});
