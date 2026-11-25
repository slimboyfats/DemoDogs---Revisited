import { describe, expect, it } from 'vitest';
import { loadContent } from '@demodogs/content';
import { World } from '@demodogs/sim';
import {
  buyCar,
  buyUpgrade,
  newCareer,
  parseCareer,
  playerSetup,
  readOutcome,
  repair,
  tradeIn,
  upgradeCost,
  type Career,
  type Outcome,
} from './career';
import {
  CUPS,
  barred,
  cupDef,
  cupRound,
  cupTable,
  enterCup,
  settleCup,
  withdraw,
  type CupDef,
} from './cups';

const C = loadContent();
const fresh = (over: Partial<Career> = {}): Career => ({ ...newCareer(C, 11), ...over });
const rich = (over: Partial<Career> = {}): Career =>
  fresh({ cash: 50000, trophies: { a: 1, b: 1, c: 1, d: 1 }, ...over });
const enter = (k: Career, id: string): Career => {
  const r = enterCup(k, id);
  if (!r.ok) throw new Error(r.why);
  return r.career;
};
/** A round's result with the player in `place` (1 = first) among the round's field. */
function result(k: Career, place: number, over: Partial<Outcome> = {}): Outcome {
  const names = cupRound(C, k)!.field.map((e) => e.name);
  names.splice(place - 1, 0, 'YOU');
  return { order: names, wrecked: false, hp: 70, damage: 30, wrecks: 0, cleared: false, ...over };
}
const play = (k: Career, place: number, over: Partial<Outcome> = {}) =>
  settleCup(C, k, result(k, place, over))!;
const def = (id: string): CupDef => cupDef(id)!;

describe('tournaments', () => {
  it('offers eight of six kinds, two of them open to a new career with its first cash', () => {
    expect(CUPS).toHaveLength(8);
    expect(new Set(CUPS.map((d) => d.kind)).size).toBe(6);
    expect(new Set(CUPS.map((d) => d.id)).size).toBe(8);
    const open = CUPS.filter((d) => barred(fresh(), d) === null);
    expect(open.map((d) => d.id)).toEqual(['puppy', 'stopwatch', 'scrap']);
    expect(barred(fresh(), def('grand'))).toMatch(/4 more trophies/);
    expect(barred(fresh({ cash: 10 }), def('puppy'))).toMatch(/cash/);
  });

  it('takes the fee, draws a field of the right size and strength, and runs one at a time', () => {
    const k = enter(fresh(), 'puppy');
    expect(k.cash).toBe(500 - def('puppy').fee);
    expect(k.cup!.rivals.map((r) => r.i).sort((a, b) => a - b)).toEqual([9, 10, 11]);
    expect(enterCup(k, 'stopwatch').ok).toBe(false);
    // the big one borrows the two best of the tier below to make six
    const g = enter(rich(), 'grand');
    expect(g.cup!.rivals.map((r) => r.i).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
    expect(withdraw(k).cup).toBeNull();
    expect(withdraw(k).cash).toBe(k.cash);
  });

  it('runs every tournament on venues of its kind, a different one each round', () => {
    for (const d of CUPS) {
      let k = enter(rich(), d.id);
      const seen = new Set<string>();
      for (let n = 0; n < d.rounds && k.cup; n++) {
        const r = cupRound(C, k)!;
        const kind = C.mode.get(C.venue.get(r.venue)!.mode)!.kind;
        expect(kind).toBe(d.kind === 'derby' ? 'derby' : 'race');
        expect(r.field.length).toBeLessThanOrEqual(d.rivals);
        expect(r.field.every((e) => C.car.has(e.car))).toBe(true);
        expect(cupRound(C, k)).toEqual(r);
        seen.add(r.venue);
        k = play(k, 1).career;
      }
      const venues = [...C.venue.values()].filter(
        (v) => C.mode.get(v.mode)!.kind === (d.kind === 'derby' ? 'derby' : 'race'),
      );
      expect(seen.size).toBe(Math.min(d.rounds, venues.length));
      expect(k.cup).toBeNull();
    }
  });

  it('a cup: points for places, a prize a round, the purse and a trophy at the end', () => {
    const d = def('puppy');
    let k = enter(fresh(), 'puppy');
    const cash = k.cash;
    const a = play(k, 1);
    expect(a.payout.lines).toEqual([{ label: 'ROUND 1: 1ST', cash: d.round }]);
    expect(a.payout.cup).toMatchObject({ round: 1, rounds: 3, scored: 10 });
    expect(a.payout.cup.place).toBeUndefined();
    expect(a.career.cup!.round).toBe(1);
    expect(a.career.hp).toBe(70);
    k = a.career;
    expect(cupTable(k)[0]).toMatchObject({ me: true, points: 10 });
    expect(cupTable(k)[1]!.points).toBe(7);
    const b = play(k, 3);
    expect(b.payout.lines[0]).toEqual({ label: 'ROUND 2: 3RD', cash: 100 });
    const c = play(b.career, 1);
    expect(c.payout.cup.place).toBe(1);
    expect(c.payout.lines.at(-1)).toEqual({ label: 'PUPPY CUP: WON', cash: d.purse[0] });
    expect(c.payout.points).toBe(d.ladder[0]);
    expect(c.career.cup).toBeNull();
    expect(c.career.trophies).toEqual({ puppy: 1 });
    expect(c.career.points).toBe(d.ladder[0]);
    expect(c.career.cash).toBe(cash + d.round * 2 + 100 + d.purse[0]);
    // the beaten rivals move up the ladder too
    expect(c.career.drivers.reduce((s, x) => s + x.points, 0)).toBeGreaterThan(
      k.drivers.reduce((s, x) => s + x.points, 0),
    );
  });

  it('a wreck earns nothing for the round and comes home a write-off; last overall wins nothing', () => {
    let k = enter(fresh(), 'puppy');
    const a = play(k, 4, { wrecked: true, hp: 0 });
    expect(a.payout.lines).toEqual([]);
    expect(a.career.hp).toBe(10);
    k = play(play(a.career, 4).career, 4).career;
    expect(k.cup).toBeNull();
    expect(k.trophies).toEqual({});
    expect(k.points).toBe(0);
  });

  it('keeps the better trophy when a tournament is run again', () => {
    let k = enter(fresh({ trophies: { puppy: 1 } }), 'puppy');
    k = play(play(play(k, 2).career, 2).career, 2).career;
    expect(k.trophies.puppy).toBe(1);
  });

  it('elimination: the last home goes out each round, and the last dog left wins', () => {
    let k = enter(rich(), 'last-dog');
    for (let n = 0; n < 4; n++) {
      const left = k.cup!.rivals.filter((r) => !r.out).length;
      expect(cupRound(C, k)!.field).toHaveLength(left);
      const s = play(k, 1);
      if (n < 3) {
        expect(s.payout.cup.cut).toBeDefined();
        expect(s.career.cup!.rivals.filter((r) => !r.out)).toHaveLength(left - 1);
      } else expect(s.payout.cup.place).toBe(1);
      k = s.career;
    }
    expect(k.trophies['last-dog']).toBe(1);
    // last home yourself: out on the spot, placed by how many were still in
    const first = enter(rich(), 'last-dog');
    const out = play(first, 5);
    expect(out.career.cup).toBeNull();
    expect(out.payout.cup.place).toBe(5);
    const third = play(play(play(first, 1).career, 1).career, 3);
    expect(third.payout.cup.place).toBe(3);
    expect(third.career.trophies['last-dog']).toBe(3);
  });

  it('a derby league scores wrecks and pays a wrecked car its placing', () => {
    const d = def('scrap');
    const k = enter(rich(), 'scrap');
    const r = cupRound(C, k)!;
    const s = play(k, 2, { wrecked: true, hp: 0, wrecks: 2, wrecksOf: { [r.field[0]!.name]: 3 } });
    expect(s.payout.cup.scored).toBe(7 + 4);
    expect(s.payout.lines.map((l) => l.label)).toEqual(['ROUND 1: 2ND', 'WRECKS ×2']);
    expect(s.payout.lines[0]!.cash).toBe(d.round / 2);
    expect(cupTable(s.career)[0]).toMatchObject({ name: r.field[0]!.name, points: 10 + 6 });
  });

  it('a bounty hunt puts the price on the best car in the field, a new one each round', () => {
    let k = enter(rich(), 'bounty');
    const marks = new Set<string>();
    for (let n = 0; n < 3; n++) {
      const r = cupRound(C, k)!;
      const m = r.field.find((e) => e.name === r.mark)!;
      expect(m.tune).toEqual({ engine: 3, tyres: 3, armor: 3 });
      marks.add(r.mark!);
      // home ahead of the wanted car: the bounty; behind it: none
      const at = r.field.indexOf(m) + 1;
      const ahead = settleCup(C, k, result(k, at, { wrecks: 1 }))!;
      expect(ahead.payout.lines.some((l) => l.label === `BOUNTY: ${r.mark}`)).toBe(true);
      expect(ahead.payout.cup.scored).toBe([6, 4, 3, 2, 1][at - 1]! + 3);
      const behind = settleCup(C, k, result(k, at + 1))!;
      expect(behind.payout.lines.some((l) => l.label.startsWith('BOUNTY:'))).toBe(false);
      k = ahead.career;
    }
    expect(marks.size).toBe(3);
  });

  it('time trials: alone, medals from the clock, and a wreck or a walk-out gets none', () => {
    const d = def('stopwatch');
    let k = enter(fresh(), 'stopwatch');
    const r = cupRound(C, k)!;
    expect(r.field).toEqual([]);
    const [gold, silver, bronze] = r.par!;
    expect(gold).toBeLessThan(silver);
    expect(silver).toBeLessThan(bronze);
    const run = (t: number | undefined, over: Partial<Outcome> = {}) =>
      settleCup(C, k, { ...result(k, 1, over), ...(t === undefined ? {} : { time: t }) })!;
    expect(run(gold - 1).payout.cup.medal).toBe(3);
    expect(run(gold + 1).payout.cup.medal).toBe(2);
    expect(run(bronze).payout.cup.medal).toBe(1);
    expect(run(bronze + 1).payout.cup.medal).toBe(0);
    expect(run(gold - 1, { wrecked: true }).payout.cup.medal).toBe(0);
    expect(run(undefined).payout.cup.medal).toBe(0);
    expect(run(gold - 1).payout.lines[0]).toEqual({ label: 'GOLD', cash: d.round });
    // gold, gold, silver is enough for the top prize; three bronzes for third
    k = run(gold - 1).career;
    k = settleCup(C, k, { ...result(k, 1), time: cupRound(C, k)!.par![0] })!.career;
    const end = settleCup(C, k, { ...result(k, 1), time: cupRound(C, k)!.par![1] })!;
    expect(end.payout.cup.place).toBe(1);
    expect(end.career.trophies.stopwatch).toBe(1);
  });

  it('endurance: twice the laps and the garage will not repair until it is over', () => {
    const k = enter(rich({ hp: 60 }), 'iron-dog');
    const r = cupRound(C, k)!;
    expect(r.laps).toBe(C.mode.get(C.venue.get(r.venue)!.mode)!.laps! * 2);
    expect(repair(C, k).ok).toBe(false);
    const s = play(k, 1, { wrecked: true, hp: 0 });
    expect(s.career.hp).toBe(30);
    expect(repair(C, withdraw(k)).ok).toBe(true);
  });

  it('the storm series brings world modifiers, more of them late on', () => {
    let k = enter(rich(), 'storm');
    const n: number[] = [];
    while (k.cup) {
      const r = cupRound(C, k)!;
      expect(r.modifiers.every((id) => C.modifier.has(id))).toBe(true);
      n.push(r.modifiers.length);
      k = play(k, 2).career;
    }
    expect(n).toEqual([1, 1, 2, 2]);
  });

  it('the car you entered is the car you finish in, and a saved tournament comes back', () => {
    const k = enter(rich(), 'puppy');
    expect(
      buyCar(
        C,
        k,
        [...C.car.keys()].find((id) => id !== k.car)!,
      ).ok,
    ).toBe(false);
    const back = parseCareer(C, JSON.stringify(play(k, 1).career))!;
    expect(back.cup).toMatchObject({ id: 'puppy', round: 1, points: 10 });
    expect(cupRound(C, back)).toEqual(cupRound(C, play(k, 1).career));
    // a tournament that is gone, or a save from before there were any, loads without one
    expect(parseCareer(C, JSON.stringify({ ...k, cup: { ...k.cup, id: 'nope' } }))!.cup).toBeNull();
    const old = JSON.parse(JSON.stringify(fresh())) as Record<string, unknown>;
    delete old.cup;
    delete old.trophies;
    delete old.gear;
    expect(parseCareer(C, JSON.stringify(old))).toMatchObject({
      cup: null,
      trophies: {},
      gear: { nitro: 0, guns: 0, ram: 0 },
    });
  });

  it('every tournament round can be raced: the world builds and runs', () => {
    for (const d of CUPS) {
      const k = enter(rich(), d.id);
      const r = cupRound(C, k)!;
      const w = new World({
        content: C,
        venue: r.venue,
        car: k.car,
        seed: r.seed,
        autopilot: true,
        field: r.field,
        player: r.player,
        knockout: true,
        modifiers: r.modifiers,
        ...(r.laps ? { laps: r.laps } : {}),
      });
      for (let n = 0; n < 300; n++) w.step();
      expect(w.cars).toHaveLength(r.field.length + 1);
      if (r.laps) expect(w.laps).toBe(r.laps);
      const o = readOutcome(w);
      expect(Object.keys(o.wrecksOf!)).toEqual(r.field.map((e) => e.name));
      expect(settleCup(C, k, o)).not.toBeNull();
    }
  });
});

describe('gear upgrades', () => {
  it('nitro, guns and the ram bar are bought by the level and change how the car starts', () => {
    let k = fresh({ cash: 100000 });
    expect(playerSetup(C, k)).toEqual({ tune: k.tune, hp: 100, fit: [] });
    const stock = new World({ content: C, venue: 'venue.kennel-loop', car: k.car, seed: 1 });
    for (const part of ['nitro', 'guns', 'ram'] as const) {
      for (let lv = 0; lv < 3; lv++) {
        const r = buyUpgrade(C, k, part);
        if (!r.ok) throw new Error(r.why);
        k = r.career;
      }
      expect(upgradeCost(C, k, part)).toBeNull();
      expect(buyUpgrade(C, k, part).ok).toBe(false);
    }
    const s = playerSetup(C, k);
    expect(s.fuel).toBeCloseTo(1.15);
    expect(s.ram).toBeCloseTo(1.6);
    const w = new World({
      content: C,
      venue: 'venue.kennel-loop',
      car: k.car,
      seed: 1,
      player: s,
    });
    expect(w.player.rounds).toBe(Math.round(stock.player.rounds * 2.5));
    expect(w.player.ram).toBeCloseTo(1.6);
    expect(w.player.fuel).toBeCloseTo(1.15);
    // they are worth something at the dealer, and go with the car
    expect(tradeIn(C, k)).toBeGreaterThan(tradeIn(C, fresh()));
    const next = buyCar(C, k, [...C.car.values()].find((c) => c.price > 0)!.id);
    expect(next.ok && next.career.gear).toEqual({ nitro: 0, guns: 0, ram: 0 });
  });
});
