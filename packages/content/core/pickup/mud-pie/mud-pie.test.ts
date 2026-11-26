import { describe, expect, it } from 'vitest';
import { grant } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { makeWorld, startRace, tricked } from '../../../src/testing';

describe('pickup.mud-pie', () => {
  it('lands on every rival in reach, and runs off when its time is up', () => {
    const { me, rivals, def, give, run, said } = tricked('pickup.mud-pie');
    expect(give()).toBe('MUD PIE x2');
    for (const o of rivals) expect(o.tricks.splat?.by).toBe(me.index);
    expect(me.tricks.splat).toBeUndefined();
    const ev = run(60 * def.seconds! + 2);
    for (const o of rivals) expect(o.tricks.splat).toBeUndefined();
    expect(said(ev)).toEqual(['on', 'on', 'off', 'off']);
  });

  it('blinds the AI drivers ahead the way smoke does', () => {
    const w = startRace(makeWorld());
    for (let i = 0; i < 30; i++) w.step();
    const order = w.standings();
    const last = order[order.length - 1]!;
    const def = loadContent().pickup.get('pickup.mud-pie')!;
    grant(w, last, def);
    for (const o of order.slice(0, -1)) {
      expect(o.tricks.splat).toBeDefined();
      if (o.ai) expect(o.blind).toBeCloseTo(def.seconds!, 5);
    }
    expect(last.tricks.splat).toBeUndefined();
  });

  it('does not land on a car inside a shield bubble', () => {
    const { w, rivals, give } = tricked('pickup.mud-pie');
    grant(w, rivals[0]!, loadContent().pickup.get('pickup.dome')!);
    expect(give()).toBe('MUD PIE x1');
    expect(rivals[0]!.tricks.splat).toBeUndefined();
  });
});
