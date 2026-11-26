import { NO_CONTROLS } from '@demodogs/shared';
import { World, rangeGive } from '@demodogs/sim';
import { describe, expect, it } from 'vitest';
import { SCHOOL, loadContent, withSchool } from './index';

const school = () =>
  new World({
    content: withSchool(loadContent()),
    venue: SCHOOL,
    car: 'car.mutt',
    seed: 1,
    sandbox: true,
    rivals: 2,
    player: { rounds: 0 },
  });

describe('the driving lesson’s lawn', () => {
  it('is a venue of its own, not one of the game’s', () => {
    expect(loadContent().venue.has(SCHOOL)).toBe(false);
    expect(withSchool(loadContent()).venue.has(SCHOOL)).toBe(true);
    // and the game's own crates are as they were
    const arms = loadContent().pickup.get('pickup.arms')!;
    expect(arms.weapons!.length).toBeGreaterThan(1);
  });

  it('is a bare fenced lawn: nothing solid in the way, no bots, and it never ends', () => {
    const w = school();
    expect(w.phase).toBe('race');
    expect(w.bots).toHaveLength(0);
    const O = w.oval!;
    const mid = w.statics.filter(
      (s) => s.def.solid !== false && Math.hypot((s.x - O.cx) / O.rx, (s.y - O.cy) / O.ry) < 0.85,
    );
    expect(mid).toHaveLength(0);
    for (let i = 0; i < 60 * 30; i++) w.step({ ...NO_CONTROLS, throttle: 1 });
    expect(w.phase).toBe('race');
  });

  it('its crate always holds rockets', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const w = new World({
        content: withSchool(loadContent()),
        venue: SCHOOL,
        car: 'car.mutt',
        seed,
        sandbox: true,
        rivals: 0,
      });
      rangeGive(w, w.player, w.content.pickup.get(w.venue.pickups[0]!)!);
      expect(w.player.weapon?.id).toBe('weapon.rocket');
      expect(w.player.ammo).toBeGreaterThan(0);
    }
  });

  it('a rocket scraps a parked target that is one blow from scrap', () => {
    const w = school();
    const P = w.player;
    const t = w.cars.find((c) => c !== P)!;
    Object.assign(t, { x: P.x + Math.cos(P.h) * 180, y: P.y + Math.sin(P.h) * 180, hp: 6 });
    rangeGive(w, P, w.content.pickup.get(w.venue.pickups[0]!)!);
    w.step({ ...NO_CONTROLS, fire: true });
    for (let i = 0; i < 60 * 3 && !t.wrecked; i++) w.step(NO_CONTROLS);
    expect(t.wrecked).toBe(true);
  });
});
