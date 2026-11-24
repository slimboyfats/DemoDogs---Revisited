import { describe, expect, it } from 'vitest';
import { loadContent } from '@demodogs/content';
import { World } from '@demodogs/sim';
import {
  FINAL_PRIZE,
  KIT,
  LOAN,
  TIERS,
  addOns,
  buyAddon,
  buyCar,
  buyKit,
  buyUpgrade,
  finalOpen,
  ladder,
  newCareer,
  parseCareer,
  raceSetup,
  rank,
  readOutcome,
  repair,
  repairCost,
  settle,
  shop,
  takeLoan,
  tradeIn,
  upgradeCost,
  type Career,
  type Outcome,
} from './career';

const C = loadContent();
const fresh = (over: Partial<Career> = {}): Career => ({ ...newCareer(C, 11), ...over });
const win: Outcome = {
  order: ['YOU', 'A', 'B', 'C'],
  wrecked: false,
  hp: 80,
  damage: 20,
  wrecks: 0,
  cleared: false,
};
const ok = <T extends { ok: boolean }>(r: T) => {
  if (!r.ok) throw new Error('expected the purchase to go through');
  return (r as T & { career: Career }).career;
};

describe('career', () => {
  it('starts in the cheapest of six cars, at the bottom of the ladder', () => {
    const k = fresh();
    const cars = shop(C);
    expect(cars).toHaveLength(6);
    expect(k.car).toBe(cars[0]!.id);
    expect(cars[0]!.price).toBe(0);
    expect(rank(k)).toBe(13);
    expect(finalOpen(k)).toBe(false);
  });

  it('enters four-car races against the tier, in tuned cars, in the same field every time', () => {
    const k = fresh();
    for (const t of TIERS) {
      const a = raceSetup(C, k, t.id);
      expect(a.field).toHaveLength(3);
      expect(new Set(a.field.map((e) => e.name)).size).toBe(3);
      expect(raceSetup(C, k, t.id)).toEqual(a);
      expect(C.mode.get(C.venue.get(a.venue)!.mode)!.kind).toBe('race');
    }
    const price = (id: 'easy' | 'hard') =>
      Math.max(...raceSetup(C, k, id).field.map((e) => C.car.get(e.car)!.price));
    expect(price('hard')).toBeGreaterThan(price('easy'));
  });

  it('pays the first three, more for a clean race, wrecks and a streak', () => {
    const k = fresh({ streak: 2 });
    const easy = TIERS[0]!;
    const plain = settle(k, 'easy', win);
    expect(plain.payout.total).toBe(easy.prize[0] + Math.round(easy.prize[0] * 0.2));
    expect(plain.career.points).toBe(easy.points[0]);
    expect(plain.career.streak).toBe(3);
    expect(plain.career.hp).toBe(80);
    expect(plain.career.day).toBe(1);
    const best = settle(fresh(), 'easy', { ...win, damage: 0, wrecks: 3, cleared: true });
    expect(best.payout.total).toBe(easy.prize[0] + easy.bonus * (1 + 3 + 2));
    const third = settle(k, 'easy', { ...win, order: ['A', 'B', 'YOU', 'C'] });
    expect(third.payout.total).toBe(easy.prize[2]);
    expect(third.career.streak).toBe(0);
  });

  it('pays nothing for fourth place or a wreck, and tows a wreck home nearly scrap', () => {
    const last = settle(fresh(), 'hard', { ...win, order: ['A', 'B', 'C', 'YOU'] });
    expect(last.payout.total).toBe(0);
    expect(last.career.points).toBe(0);
    const dead = settle(fresh(), 'hard', { ...win, wrecked: true, hp: 0 });
    expect(dead.payout.total).toBe(0);
    expect(dead.career.hp).toBe(10);
  });

  it('scores the rivals that raced, so the ladder moves', () => {
    const k = fresh();
    const s = raceSetup(C, k, 'easy');
    const names = s.field.map((e) => e.name);
    const after = settle(k, 'easy', { ...win, order: [names[0]!, 'YOU', names[1]!, names[2]!] });
    const pts = (c: Career, n: string) => c.drivers.find((d) => d.name === n)!.points;
    expect(pts(after.career, names[0]!) - pts(k, names[0]!)).toBe(TIERS[0]!.points[0]);
    expect(pts(after.career, names[2]!)).toBe(pts(k, names[2]!));
    expect(after.career.points).toBe(TIERS[0]!.points[1]);
  });

  it('sells repairs, upgrades up to the top level, and one-race kit', () => {
    let k = fresh({ cash: 100000, hp: 40 });
    const fix = repairCost(C, k);
    expect(fix).toBeGreaterThan(0);
    k = ok(repair(C, k));
    expect(k.hp).toBe(100);
    expect(k.cash).toBe(100000 - fix);
    expect(repair(C, k).ok).toBe(false);
    const first = upgradeCost(C, k, 'engine')!;
    k = ok(buyUpgrade(C, k, 'engine'));
    expect(upgradeCost(C, k, 'engine')).toBeGreaterThan(first);
    k = ok(buyUpgrade(C, ok(buyUpgrade(C, k, 'engine')), 'engine'));
    expect(upgradeCost(C, k, 'engine')).toBeNull();
    expect(buyUpgrade(C, k, 'engine').ok).toBe(false);
    k = ok(buyKit(k, 'spikes'));
    expect(buyKit(k, 'spikes').ok).toBe(false);
    const s = raceSetup(C, ok(buyKit(ok(buyKit(k, 'mines')), 'sabotage')), 'easy');
    expect(s.player.ram).toBeGreaterThan(1);
    expect(s.player.weapon?.ammo).toBe(3);
    expect(s.player.tune?.engine).toBe(3);
    expect(s.field[0]!.hp).toBeLessThan(100);
    expect(settle(k, 'easy', win).career.kit.spikes).toBe(false);
    expect(buyKit(fresh({ cash: KIT.sabotage.price - 1 }), 'sabotage').ok).toBe(false);
  });

  it('repairs as much as the cash covers', () => {
    const k = fresh({ cash: 40, hp: 50 });
    const r = ok(repair(C, k));
    expect(r.hp).toBeGreaterThan(50);
    expect(r.hp).toBeLessThan(100);
    expect(r.cash).toBeGreaterThanOrEqual(0);
  });

  it('trades the old car in against a new one', () => {
    const cars = shop(C);
    const poor = fresh();
    expect(buyCar(C, poor, cars[1]!.id).ok).toBe(false);
    let k = fresh({ cash: cars[1]!.price });
    k = ok(buyUpgrade(C, k, 'tyres'));
    expect(tradeIn(C, k)).toBeGreaterThan(0);
    k = ok(buyCar(C, { ...k, cash: cars[1]!.price }, cars[1]!.id));
    expect(k.car).toBe(cars[1]!.id);
    expect(k.tune.tyres).toBe(0);
    expect(k.cash).toBeGreaterThan(0);
    expect(tradeIn(C, k)).toBeLessThan(cars[1]!.price);
    expect(tradeIn(C, { ...k, hp: 30 })).toBeLessThan(tradeIn(C, k));
  });

  it('lends once, and the shark takes half of each payout until it is paid', () => {
    let k = ok(takeLoan(fresh()));
    expect(k.cash).toBe(500 + LOAN.cash);
    expect(takeLoan(k).ok).toBe(false);
    const r = settle(k, 'easy', win);
    expect(r.payout.total).toBe(TIERS[0]!.prize[0] / 2);
    expect(r.career.debt).toBe(LOAN.owed - TIERS[0]!.prize[0] / 2);
    k = { ...r.career, debt: 100 };
    expect(settle(k, 'easy', win).career.debt).toBe(0);
  });

  it('opens the final to the ladder leader, and beating the Top Dog ends it', () => {
    const k = fresh({ points: 78 });
    expect(ladder(k)[0]!.me).toBe(true);
    expect(finalOpen(k)).toBe(true);
    const s = raceSetup(C, k, 'final');
    expect(s.field).toHaveLength(1);
    expect(s.field[0]!.car).toBe(shop(C).at(-1)!.id);
    const lost = settle(k, 'final', { ...win, order: [s.field[0]!.name, 'YOU'] });
    expect(lost.career.champion).toBe(false);
    expect(lost.payout.total).toBe(0);
    const won = settle(k, 'final', { ...win, order: ['YOU', s.field[0]!.name] });
    expect(won.payout.total).toBe(FINAL_PRIZE);
    expect(won.payout.champion).toBe(true);
    expect(finalOpen(won.career)).toBe(false);
  });

  it('saves and loads, and refuses anything that is not a career', () => {
    const k = fresh({ cash: 1234 });
    expect(parseCareer(C, JSON.stringify(k))).toEqual(k);
    expect(parseCareer(C, null)).toBeNull();
    expect(parseCareer(C, '{nope')).toBeNull();
    expect(parseCareer(C, JSON.stringify({ ...k, car: 'car.gone' }))).toBeNull();
    expect(parseCareer(C, JSON.stringify({ ...k, v: 2 }))).toBeNull();
  });

  it('sells add-ons: garage ones stay on the car, market ones last a race', () => {
    const garage = addOns(C, 'garage');
    const market = addOns(C, 'market');
    expect(garage.length).toBeGreaterThanOrEqual(5);
    expect(market.length).toBeGreaterThanOrEqual(2);
    expect(buyAddon(C, fresh({ cash: 0 }), garage[0]!.id).ok).toBe(false);
    expect(buyAddon(C, fresh({ cash: 1e6 }), 'pickup.repair').ok).toBe(false);
    let k = fresh({ cash: 50000 });
    const before = tradeIn(C, k);
    k = ok(buyAddon(C, k, garage[0]!.id));
    k = ok(buyAddon(C, k, market[0]!.id));
    expect(k.cash).toBe(50000 - garage[0]!.price - market[0]!.price);
    expect(buyAddon(C, k, garage[0]!.id).ok).toBe(false);
    expect(buyAddon(C, k, market[0]!.id).ok).toBe(false);
    // both come to the grid on the car
    expect(raceSetup(C, k, 'easy').player.fit).toEqual([garage[0]!.id, market[0]!.id]);
    // the dealer pays for what is bolted on, and it goes with the car
    expect(tradeIn(C, k)).toBeGreaterThan(before);
    const after = settle(k, 'easy', win).career;
    expect(after.addons).toEqual([garage[0]!.id]);
    expect(after.extras).toEqual([]);
    expect(ok(buyCar(C, k, shop(C)[1]!.id)).addons).toEqual([]);
  });

  it('reads a career saved before there were add-ons, and gives the big league some', () => {
    const old: Partial<Career> = fresh();
    delete old.addons;
    delete old.extras;
    const k = parseCareer(C, JSON.stringify(old))!;
    expect(k.addons).toEqual([]);
    expect(k.extras).toEqual([]);
    expect(parseCareer(C, JSON.stringify({ ...old, addons: ['pickup.gone'] }))!.addons).toEqual([]);
    expect(raceSetup(C, k, 'easy').field.every((e) => !e.fit?.length)).toBe(true);
    expect(raceSetup(C, k, 'hard').field.some((e) => (e.fit?.length ?? 0) > 0)).toBe(true);
    expect(raceSetup(C, { ...k, points: 999 }, 'final').field[0]!.fit!.length).toBeGreaterThan(3);
  });

  it('runs a real knockout race from a setup and reads the result', () => {
    const k = ok(buyKit(fresh({ cash: 5000 }), 'sabotage'));
    const s = raceSetup(C, k, 'easy');
    const w = new World({
      content: C,
      venue: s.venue,
      car: k.car,
      seed: s.seed,
      autopilot: true,
      field: s.field,
      player: s.player,
      knockout: true,
    });
    expect(w.cars).toHaveLength(4);
    expect(w.cars.map((c) => c.name).sort()).toEqual([...s.field.map((e) => e.name), 'YOU'].sort());
    expect(w.cars.find((c) => c.name === s.field[0]!.name)!.hp).toBe(45);
    for (let i = 0; i < 60 * 240 && w.phase !== 'over'; i++) w.step();
    expect(w.phase).toBe('over');
    const o = readOutcome(w);
    expect(o.order).toHaveLength(4);
    expect(o.order).toContain('YOU');
    const r = settle(k, 'easy', o);
    expect(r.career.day).toBe(1);
    expect(r.career.cash).toBeGreaterThanOrEqual(k.cash);
  }, 60000);
});
