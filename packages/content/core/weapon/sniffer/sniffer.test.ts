import { describe, expect, it } from 'vitest';
import { NO_CONTROLS } from '@demodogs/shared';
import { loadContent } from '../../../src/index';
import { flatBench, put } from '../../../src/testing';

const sniffer = () => loadContent().weapon.get('weapon.sniffer')!;

function arena() {
  const w = flatBench({ rivals: 2 });
  const me = w.player;
  const [a, b] = w.cars.filter((c) => c !== me) as [(typeof w.cars)[0], (typeof w.cars)[0]];
  a.ai = b.ai = null;
  const x = w.oval!.cx - 150;
  const y = w.oval!.cy;
  put(me, x, y, 0);
  me.weapon = sniffer();
  me.ammo = sniffer().ammo;
  return { w, me, a, b, x, y };
}

describe('weapon.sniffer', () => {
  it('locks onto the nearest rival ahead, not the one further off', () => {
    const { w, me, a, b, x, y } = arena();
    put(a, x + 200, y + 60, 0);
    put(b, x + 110, y - 50, 0);
    w.step({ ...NO_CONTROLS, fire: true });
    expect(w.rockets.length).toBe(1);
    expect(w.rockets[0]!.target).toBe(b.index);
    expect(me.ammo).toBe(1);
  });

  it('chases its target wherever it drives, and hits it', () => {
    const { w, me, a, b, x, y } = arena();
    put(a, x + 140, y + 70, 0);
    put(b, w.oval!.cx + 300, w.oval!.cy - 300, 0);
    w.step({ ...NO_CONTROLS, fire: true });
    expect(w.rockets[0]!.target).toBe(a.index);
    // the target swerves hard away across the rocket's nose
    for (let i = 0; i < 200 && w.rockets.length; i++) {
      a.y += 1.2;
      a.vx = a.vy = 0;
      w.step();
    }
    expect(w.rockets.length).toBe(0);
    expect(a.hp).toBeLessThan(100);
    expect(b.hp).toBe(100);
    expect(me.score).toBeGreaterThan(0);
  });

  it('flies straight on with no lock when nobody is ahead', () => {
    const { w, a, b, x, y } = arena();
    put(a, x - 100, y, 0);
    put(b, x, y + 200, 0);
    w.step({ ...NO_CONTROLS, fire: true });
    expect(w.rockets[0]!.target).toBeUndefined();
  });

  it('comes out of arms crates', () => {
    expect(loadContent().pickup.get('pickup.arms')!.weapons).toContain('weapon.sniffer');
  });
});
