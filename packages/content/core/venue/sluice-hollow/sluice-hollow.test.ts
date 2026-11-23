import { describe, expect, it } from 'vitest';
import { breached, explode, fall, footing, riversOf, type World } from '@demodogs/sim';
import { makeWorld, runUntil, startRace } from '../../../src/testing';

const venue = 'venue.sluice-hollow';
const river = (w: World) => riversOf(w)[0]!;
const kind = (id: string) => (w: World) => w.statics.filter((s) => s.def.id === id);
const decks = { wood: kind('prop.deck-plank'), steel: kind('prop.deck-steel') };

/** Blow the dam: knock a piece out in the middle of it. */
function breach(w: World) {
  const D = river(w).dam;
  const s = D[Math.floor(D.length / 2)]!;
  fall(w, s, s.x, s.y);
}

describe(venue, () => {
  it('an all-AI race runs to the finish', () => {
    const w = makeWorld({ venue, car: 'car.mutt', autopilot: true });
    runUntil(w, (w) => w.phase === 'over', 60 * 300);
    expect(w.phase).toBe('over');
    expect(w.finishers.length).toBeGreaterThanOrEqual(1);
  });

  it('the road crosses the river twice: a plank bridge, then a steel one, both over the road', () => {
    const w = makeWorld({ venue });
    expect(river(w).bridges.length).toBe(2);
    for (const D of [decks.wood(w), decks.steel(w)]) {
      expect(D.length).toBeGreaterThan(20);
      for (const s of D) expect(w.offroad(s.x, s.y)).toBe(false);
    }
    expect(Math.min(...decks.wood(w).map((s) => s.y))).toBeLessThan(
      Math.min(...decks.steel(w).map((s) => s.y)),
    );
  });

  it('nothing but the bridges stands in the water', () => {
    const w = makeWorld({ venue });
    const R = river(w);
    const own = new Set([...R.bridges.flat(), ...R.dam]);
    for (const s of w.statics) {
      if (own.has(s)) continue;
      for (let i = 0; i < R.n; i += 2)
        expect(Math.hypot(s.x - R.x[i]!, s.y - R.y[i]!)).toBeGreaterThan(R.half[i]!);
    }
  });

  it('a hole blown in a bridge fills with river', () => {
    const w = startRace(makeWorld({ venue }));
    const s = decks.wood(w)[10]!;
    expect(footing(w, s.x, s.y)[1]).toBe(0);
    explode(w, s.x, s.y, 0.95, null);
    expect(s.down).toBe(true);
    w.step();
    expect(footing(w, s.x, s.y)[1]).toBeGreaterThan(2);
    expect(w.takeEvents().some((e) => e.t === 'spill')).toBe(true);
  });

  it('the powder by the dam can breach it', () => {
    const w = startRace(makeWorld({ venue, rivals: 0 }));
    w.bots.length = 0;
    for (const p of w.props) if (p.def.id === 'prop.powder-keg' && p.y < 420) p.fuse = 0.05;
    runUntil(w, () => breached(river(w)), 120);
    expect(breached(river(w))).toBe(true);
  });

  it('a breach floods the valley: the plank bridge washes away, the steel one stands, mud on the banks', () => {
    const w = startRace(makeWorld({ venue, rivals: 0 }));
    const R = river(w);
    const before = w.spills.length;
    const mud = () => w.spills.filter((s) => s.def.id === 'material.mud').length;
    const mud0 = mud();
    breach(w);
    runUntil(w, () => R.front >= R.n - 1, 60 * 20);
    expect(R.front).toBe(R.n - 1);
    expect(decks.wood(w).every((s) => s.down)).toBe(true);
    expect(decks.steel(w).every((s) => !s.down)).toBe(true);
    expect(w.spills.length).toBeGreaterThan(before + 100);
    expect(mud()).toBeGreaterThan(mud0 + 20);
    // the breach eats into the wall either side
    runUntil(w, () => false, 60 * 3);
    expect(R.dam.filter((s) => s.down).length).toBeGreaterThan(3);
  });

  it('the flood sweeps a car on the bridge down the river', () => {
    const w = startRace(makeWorld({ venue, rivals: 0 }));
    const R = river(w);
    const P = w.player;
    const s = decks.wood(w)[Math.floor(decks.wood(w).length / 2)]!;
    breach(w);
    runUntil(w, () => R.front > R.damAt + 10, 600);
    P.x = s.x;
    P.y = s.y;
    P.vx = P.vy = 0;
    const y0 = P.y;
    runUntil(w, () => R.front > R.bridge.indexOf(1), 600);
    // the river runs south here
    expect(P.y).toBeGreaterThan(y0 + 10);
  });

  it('a race still finishes with the dam gone and the plank bridge out', () => {
    const w = makeWorld({ venue, car: 'car.mutt', autopilot: true });
    breach(w);
    runUntil(w, (w) => w.phase === 'over', 60 * 320);
    expect(decks.wood(w).every((s) => s.down)).toBe(true);
    expect(w.phase).toBe('over');
    expect(w.finishers.length).toBeGreaterThanOrEqual(1);
  });

  it('lays out the same every time', () => {
    const a = makeWorld({ venue, seed: 3 });
    const b = makeWorld({ venue, seed: 3 });
    expect(a.hash()).toBe(b.hash());
    for (const w of [a, b]) {
      breach(w);
      runUntil(w, () => false, 600);
    }
    expect(a.hash()).toBe(b.hash());
  });
});
