import { describe, expect, it } from 'vitest';
import { rangeProp, stand } from '@demodogs/sim';
import { loadContent } from '../../../src';
import { flatBench, propTest, put } from '../../../src/testing';

describe('prop.barrel', () => {
  it('gets shoved by a slow car', () => {
    const r = propTest('prop.barrel', 40);
    expect(r.prop.alive).toBe(true);
    expect(r.prop.x).toBeGreaterThan(r.start);
  });

  it('bursts when rammed hard, rockets up and blows apart in the air', () => {
    const r = propTest('prop.barrel', 170);
    expect(r.prop.alive).toBe(false);
    expect(r.events).toContain('explode');
    expect(r.events.indexOf('launch')).toBeGreaterThan(-1);
    expect(r.events.indexOf('airburst')).toBeGreaterThan(r.events.indexOf('launch'));
    expect(r.maxZ).toBeGreaterThan(30);
  });

  it('rains burning stars and pools of fuel, and leaves nothing in the air', () => {
    const r = propTest('prop.barrel', 170);
    const w = r.world;
    const seen = [...r.events];
    for (let i = 0; i < 600; i++) {
      w.step();
      for (const e of w.takeEvents()) seen.push(e.t);
    }
    expect(seen.filter((t) => t === 'pop').length).toBe(6);
    expect(seen.filter((t) => t === 'blaze').length).toBe(3);
    expect(w.embers.length).toBe(0);
    expect(w.blazes.length).toBe(0);
  });

  it('a pool of fire sets off a drum standing in it, and burns a car', () => {
    const r = propTest('prop.barrel', 40);
    const w = r.world;
    const p = w.props[0]!;
    const c = w.player;
    c.vx = c.vy = 0;
    const hp = c.hp;
    w.blazes.push({ x: p.x, y: p.y, r: 9, t: 3, bite: 0, owner: -1 });
    w.blazes.push({ x: c.x, y: c.y, r: 9, t: 3, bite: 0, owner: -1 });
    const seen: string[] = [];
    for (let i = 0; i < 120; i++) {
      w.step();
      for (const e of w.takeEvents()) seen.push(e.t);
    }
    expect(seen).toContain('launch');
    expect(c.hp).toBeLessThan(hp);
  });

  /** A car at `speed` towards a row of barrels 56 px on, with a big ramp before them or not. */
  function row(speed: number, ramp: boolean) {
    const C = loadContent();
    const w = flatBench();
    const c = w.player;
    const x = w.oval!.cx - 120;
    const y = w.oval!.cy;
    if (ramp) stand(w, C.prop.get('prop.big-ramp')!, x, y, 0, 0);
    for (let k = -2; k <= 2; k++) rangeProp(w, C.prop.get('prop.barrel')!, x + 56, y + k * 9);
    const at = w.props.map((p) => [p.x, p.y]);
    put(c, x - 40, y, 0, speed);
    const events: string[] = [];
    let over = 0;
    for (let i = 0; i < 90; i++) {
      w.step({ steer: 0, throttle: 1, brake: false, boost: false, fire: false });
      for (const e of w.takeEvents()) events.push(e.t);
      if (Math.abs(c.x - (x + 56)) < 6) over = Math.max(over, c.z);
    }
    const moved = w.props.some(
      (p, i) => !p.alive || Math.hypot(p.x - at[i]![0]!, p.y - at[i]![1]!) > 0.5,
    );
    return { events, over, moved, car: c };
  }

  it('is flown over by a car off a ramp, as the big jumps are laid out', () => {
    // on the ground it ploughs into them
    expect(row(160, false).moved).toBe(true);
    // off the ramp it is over them: nothing is touched, nothing goes off
    for (const speed of [160, 265]) {
      const r = row(speed, true);
      expect(r.over, `${speed}`).toBeGreaterThan(8);
      expect(r.moved, `${speed}`).toBe(false);
      expect(r.events).not.toContain('explode');
    }
  });
});
