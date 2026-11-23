import { TUNE_MAX } from '@demodogs/shared';
import { Rng, type Content, type Entrant, type Setup, type Tune, type World } from '@demodogs/sim';

/**
 * The career: start in the cheapest car with a little cash, enter four-car knockout races for
 * prize money, spend it on repairs, upgrades, better cars and under-the-counter extras, and climb
 * the ladder until the Top Dog will race you one on one. Pure rules over a plain state object, so
 * the whole thing can be tested and saved as JSON; the screens only call these functions.
 */
export type TierId = 'easy' | 'medium' | 'hard';
export type RaceId = TierId | 'final';
export type Part = keyof Tune;
export type KitId = 'mines' | 'spikes' | 'fuel' | 'sabotage';

export interface Driver {
  name: string;
  paint: string;
  points: number;
}

export interface Career {
  v: 1;
  seed: number;
  /** Races entered so far. */
  day: number;
  cash: number;
  car: string;
  tune: Tune;
  /** The car's health between races, 1 to 100. */
  hp: number;
  /** Owed to the loan shark. */
  debt: number;
  /** Bought for the next race only. */
  kit: Record<KitId, boolean>;
  /** Add-ons (pickup ids) bolted to the car for good: they go when the car is traded in. */
  addons: string[];
  /** Add-ons bought on the black market for the next race only. */
  extras: string[];
  points: number;
  wins: number;
  /** Wins in a row. */
  streak: number;
  /** The twelve rivals, strongest first: four to a tier. */
  drivers: Driver[];
  champion: boolean;
}

export interface Tier {
  id: TierId;
  name: string;
  blurb: string;
  /** Prize money and ladder points for first, second and third. */
  prize: readonly [number, number, number];
  points: readonly [number, number, number];
  /** Paid for a clean race and for each rival you wreck; twice more if you wreck them all. */
  bonus: number;
}

export const TIERS: readonly Tier[] = [
  {
    id: 'easy',
    name: 'BACKYARD',
    blurb: 'Clunkers and first-timers.',
    prize: [700, 400, 200],
    points: [3, 2, 1],
    bonus: 150,
  },
  {
    id: 'medium',
    name: 'JUNKYARD',
    blurb: 'Tuned cars, drivers who ram back.',
    prize: [1800, 1000, 500],
    points: [6, 4, 2],
    bonus: 400,
  },
  {
    id: 'hard',
    name: 'BIG LEAGUE',
    blurb: 'The fastest cars on the ladder.',
    prize: [4000, 2200, 1100],
    points: [10, 6, 3],
    bonus: 900,
  },
];
export const FINAL_PRIZE = 12000;

export const KIT: Readonly<Record<KitId, { name: string; blurb: string; price: number }>> = {
  mines: { name: 'MINES', blurb: 'Three mines in the boot at the start.', price: 300 },
  spikes: { name: 'RAM SPIKES', blurb: 'Your rams hurt half as much again.', price: 500 },
  fuel: { name: 'HOT FUEL', blurb: 'Nitro pushes harder.', price: 400 },
  sabotage: { name: 'SABOTAGE', blurb: 'The fastest rival starts half wrecked.', price: 900 },
};
export const LOAN = { cash: 2500, owed: 3500 } as const;
/** The share of every payout the loan shark takes until the debt is cleared. */
export const SHARK_CUT = 0.5;
const START_CASH = 500;
const TOP_DOG: Driver = { name: 'OLD IRONJAW', paint: '#d8dce4', points: 0 };

const NAMES = [
  'DUCHESS',
  'FANG',
  'GNASHER',
  'TANK',
  'DOZER',
  'REX',
  'BONES',
  'SCRAPS',
  'BISCUIT',
  'PATCH',
  'WHISKERS',
  'NIBBLES',
] as const;
const PAINTS = [
  '#9b5bd6',
  '#d3323e',
  '#34b6c2',
  '#5a6cf0',
  '#f08c2a',
  '#4fbf6a',
  '#e45fa8',
  '#c9d23a',
  '#8a8f99',
  '#b5793a',
  '#6fd0a8',
  '#d9a0c8',
] as const;

/** The car shop, cheapest first. */
export function shop(c: Content): { id: string; name: string; blurb: string; price: number }[] {
  return [...c.car.values()]
    .map((m) => ({ id: m.id, name: m.meta.name, blurb: m.meta.description, price: m.price }))
    .sort((a, b) => a.price - b.price || (a.id < b.id ? -1 : 1));
}

export function newCareer(c: Content, seed: number): Career {
  return {
    v: 1,
    seed,
    day: 0,
    cash: START_CASH,
    car: shop(c)[0]!.id,
    tune: { engine: 0, tyres: 0, armor: 0 },
    hp: 100,
    debt: 0,
    kit: { mines: false, spikes: false, fuel: false, sabotage: false },
    addons: [],
    extras: [],
    points: 0,
    wins: 0,
    streak: 0,
    drivers: NAMES.map((name, i) => ({ name, paint: PAINTS[i]!, points: 78 - i * 6 })),
    champion: false,
  };
}

const priceOf = (c: Content, car: string): number => c.car.get(car)?.price ?? 0;

/** What the next level of an upgrade costs on this car, or null at the top level. */
export function upgradeCost(c: Content, k: Career, part: Part): number | null {
  const lv = k.tune[part];
  if (lv >= TUNE_MAX) return null;
  return Math.round(((400 + priceOf(c, k.car) * 0.06) * (lv + 1)) / 50) * 50;
}

function spentOnTune(c: Content, k: Career): number {
  let sum = 0;
  for (const part of ['engine', 'tyres', 'armor'] as const)
    for (let lv = 0; lv < k.tune[part]; lv++)
      sum += upgradeCost(c, { ...k, tune: { ...k.tune, [part]: lv } }, part)!;
  return sum;
}

export interface AddOn {
  id: string;
  name: string;
  blurb: string;
  price: number;
}

/** The add-ons for sale in the garage (kept on the car) or on the black market (one race). */
export function addOns(c: Content, where: 'garage' | 'market'): AddOn[] {
  return [...c.pickup.values()]
    .filter((m) => m.price !== undefined && (m.sold ?? 'garage') === where)
    .map((m) => ({ id: m.id, name: m.meta.name, blurb: m.meta.description, price: m.price! }))
    .sort((a, b) => a.price - b.price || (a.id < b.id ? -1 : 1));
}

const spentOnAddons = (c: Content, k: Career): number =>
  k.addons.reduce((s, id) => s + (c.pickup.get(id)?.price ?? 0), 0);

/** What the dealer gives for the car you have: less for its age, its upgrades and its dents. */
export function tradeIn(c: Content, k: Career): number {
  const worth = priceOf(c, k.car) * 0.6 + (spentOnTune(c, k) + spentOnAddons(c, k)) * 0.5;
  return Math.round((worth * (0.6 + 0.4 * (k.hp / 100))) / 50) * 50;
}

/** What a full repair costs. */
export function repairCost(c: Content, k: Career): number {
  return Math.ceil((100 - k.hp) * (4 + priceOf(c, k.car) / 1500));
}

export type Buy = { ok: true; career: Career } | { ok: false; why: string };
const no = (why: string): Buy => ({ ok: false, why });
const yes = (career: Career): Buy => ({ ok: true, career });

export function buyUpgrade(c: Content, k: Career, part: Part): Buy {
  const cost = upgradeCost(c, k, part);
  if (cost === null) return no('Already at the top level.');
  if (cost > k.cash) return no('Not enough cash.');
  return yes({ ...k, cash: k.cash - cost, tune: { ...k.tune, [part]: k.tune[part] + 1 } });
}

export function repair(c: Content, k: Career): Buy {
  const cost = repairCost(c, k);
  if (cost === 0) return no('Nothing to fix.');
  if (cost <= k.cash) return yes({ ...k, cash: k.cash - cost, hp: 100 });
  // not enough for all of it: fix what the cash covers
  const per = cost / (100 - k.hp);
  const fixed = Math.floor(k.cash / per);
  if (fixed < 1) return no('Not enough cash.');
  return yes({ ...k, cash: k.cash - Math.ceil(fixed * per), hp: k.hp + fixed });
}

/** Swap cars: the old one is traded in, the new one arrives stock and whole. */
export function buyCar(c: Content, k: Career, car: string): Buy {
  if (car === k.car) return no('You already drive it.');
  if (!c.car.has(car)) return no('No such car.');
  const cost = priceOf(c, car) - tradeIn(c, k);
  if (cost > k.cash) return no('Not enough cash.');
  return yes({
    ...k,
    cash: k.cash - cost,
    car,
    tune: { engine: 0, tyres: 0, armor: 0 },
    addons: [],
    hp: 100,
  });
}

/** Buy an add-on: bolted on for good in the garage, or loaded for one race on the black market. */
export function buyAddon(c: Content, k: Career, id: string): Buy {
  const m = c.pickup.get(id);
  if (!m || m.price === undefined) return no('Not for sale.');
  const market = m.sold === 'market';
  if ((market ? k.extras : k.addons).includes(id))
    return no(market ? 'Already bought for this race.' : 'Already fitted.');
  if (m.price > k.cash) return no('Not enough cash.');
  return yes({
    ...k,
    cash: k.cash - m.price,
    ...(market ? { extras: [...k.extras, id] } : { addons: [...k.addons, id] }),
  });
}

export function buyKit(k: Career, id: KitId): Buy {
  if (k.kit[id]) return no('Already bought for this race.');
  if (KIT[id].price > k.cash) return no('Not enough cash.');
  return yes({ ...k, cash: k.cash - KIT[id].price, kit: { ...k.kit, [id]: true } });
}

export function takeLoan(k: Career): Buy {
  if (k.debt > 0) return no('Pay back what you owe first.');
  return yes({ ...k, cash: k.cash + LOAN.cash, debt: LOAN.owed });
}

export interface Standing {
  name: string;
  paint: string;
  points: number;
  me: boolean;
}

/** The ladder, best first. The player wins a tie, so reaching the top score is enough. */
export function ladder(k: Career): Standing[] {
  const all: Standing[] = k.drivers.map((d) => ({ ...d, me: false }));
  all.push({ name: 'YOU', paint: '#ffffff', points: k.points, me: true });
  return all.sort((a, b) => b.points - a.points || (a.me ? -1 : b.me ? 1 : 0));
}

export const rank = (k: Career): number => ladder(k).findIndex((s) => s.me) + 1;
/** The Top Dog races whoever leads the ladder. */
export const finalOpen = (k: Career): boolean => !k.champion && rank(k) === 1;

export interface RaceSetup {
  race: RaceId;
  venue: string;
  seed: number;
  field: Entrant[];
  player: Setup;
}

/** The drivers of a tier: indices into `drivers`, four to a tier, strongest tier first. */
function tierDrivers(id: TierId): number[] {
  const at = id === 'hard' ? 0 : id === 'medium' ? 4 : 8;
  return [at, at + 1, at + 2, at + 3];
}

/** The add-ons a rival has bolted on: none in the backyard, more the higher the tier and seat. */
function rivalAddons(c: Content, tier: number, seat: number, i: number): string[] {
  const all = addOns(c, 'garage');
  const n = Math.min(all.length, Math.max(0, tier + (seat > 1 ? 1 : 0) - 1));
  return Array.from({ length: n }, (_, j) => all[(i * 3 + j * 2 + 1) % all.length]!.id).filter(
    (id, j, list) => list.indexOf(id) === j,
  );
}

/** The car a rival brings: better cars and more upgrades the higher their tier and seat. */
function rivalEntry(c: Content, d: Driver, i: number): Entrant {
  const cars = shop(c);
  const tier = 2 - Math.floor(i / 4);
  const seat = 3 - (i % 4);
  const car = cars[Math.min(cars.length - 1, tier * 2 + (seat > 1 ? 1 : 0))]!;
  const lv = Math.min(TUNE_MAX, Math.floor((tier + seat) / 2));
  return {
    car: car.id,
    name: d.name,
    paint: d.paint,
    tune: { engine: lv, tyres: lv, armor: Math.max(0, lv - 1) },
    skill: 0.84 + tier * 0.06 + seat * 0.015,
    fit: rivalAddons(c, tier, seat, i),
  };
}

/** Who and where: three rivals of the tier (or the Top Dog alone), the venue, and your car. */
export function raceSetup(c: Content, k: Career, race: RaceId): RaceSetup {
  const rng = new Rng(k.seed + k.day * 7919 + 1);
  const venues = [...c.venue.values()]
    .filter((v) => c.mode.get(v.mode)?.kind === 'race')
    .map((v) => v.id)
    .sort();
  const tierAt = race === 'final' ? 3 : TIERS.findIndex((t) => t.id === race);
  const venue = venues[(k.day + tierAt) % venues.length]!;
  let field: Entrant[];
  if (race === 'final') {
    const best = shop(c).at(-1)!;
    field = [
      {
        car: best.id,
        name: TOP_DOG.name,
        paint: TOP_DOG.paint,
        tune: { engine: TUNE_MAX, tyres: TUNE_MAX, armor: TUNE_MAX },
        skill: 1.04,
        // the Top Dog's car has everything on it
        fit: addOns(c, 'garage').map((a) => a.id),
      },
    ];
  } else {
    const pool = tierDrivers(race);
    pool.splice(rng.int(pool.length), 1);
    field = pool.map((i) => rivalEntry(c, k.drivers[i]!, i));
    // sabotage: the quickest one on the grid starts half wrecked
    if (k.kit.sabotage) field[0] = { ...field[0]!, hp: 45 };
  }
  const mine = [...c.weapon.values()].find((w) => w.kind === 'mine');
  const player: Setup = {
    tune: { ...k.tune },
    hp: k.hp,
    ...(k.kit.spikes ? { ram: 1.5 } : {}),
    ...(k.kit.fuel ? { fuel: 1.12 } : {}),
    ...(k.kit.mines && mine ? { weapon: { id: mine.id, ammo: 3 } } : {}),
    fit: [...k.addons, ...k.extras].filter((id) => c.pickup.has(id)),
  };
  return { race, venue, seed: rng.int(2 ** 31), field, player };
}

/** How a race came out, read off the finished world. */
export interface Outcome {
  /** Finishing order by name, the player as 'YOU'. */
  order: string[];
  /** The player's car was wrecked: no pay, and it is towed home a write-off short of scrap. */
  wrecked: boolean;
  /** Health left at the flag. */
  hp: number;
  /** Health lost during the race. */
  damage: number;
  /** Rivals the player wrecked, and whether none was left running. */
  wrecks: number;
  cleared: boolean;
  /** Money picked up off the track. It is kept wherever the car finished, unless it was wrecked. */
  cash?: number;
}

export interface Payout {
  place: number;
  lines: { label: string; cash: number }[];
  /** Cash in hand after the loan shark's cut. */
  total: number;
  points: number;
  champion: boolean;
}

/** Settle a race: pay out, move the ladder, carry the damage home, use up the bought kit. */
export function settle(k: Career, race: RaceId, o: Outcome): { career: Career; payout: Payout } {
  const place = o.order.indexOf('YOU') + 1;
  const lines: Payout['lines'] = [];
  let points = 0;
  let champion = k.champion;
  const paid = !o.wrecked && place >= 1 && place <= 3;
  const drivers = k.drivers.map((d) => ({ ...d }));
  if (race === 'final') {
    if (paid && place === 1) {
      lines.push({ label: 'BEAT THE TOP DOG', cash: FINAL_PRIZE });
      champion = true;
    }
  } else {
    const tier = TIERS.find((t) => t.id === race)!;
    if (paid) {
      const prize = tier.prize[place - 1]!;
      lines.push({ label: `${['1ST', '2ND', '3RD'][place - 1]} PLACE`, cash: prize });
      points = tier.points[place - 1]!;
      if (place === 1 && k.streak > 0)
        lines.push({
          label: `${k.streak + 1} WINS IN A ROW`,
          cash: Math.round(prize * Math.min(0.5, k.streak * 0.1)),
        });
      if (o.damage < 5) lines.push({ label: 'NOT A SCRATCH', cash: tier.bonus });
      if (o.wrecks > 0) lines.push({ label: `WRECKS ×${o.wrecks}`, cash: tier.bonus * o.wrecks });
      if (o.cleared) lines.push({ label: 'LAST CAR RUNNING', cash: tier.bonus * 2 });
    }
    // the rivals in the race score for where they came; the rest of the ladder drifts a little
    const rng = new Rng(k.seed + k.day * 104729 + 7);
    for (const d of drivers) {
      const at = o.order.indexOf(d.name);
      if (at >= 0) d.points += at < 3 ? tier.points[at]! : 0;
      else if (rng.next() < 0.3) d.points += 1;
    }
  }
  if (!o.wrecked && (o.cash ?? 0) > 0) lines.push({ label: 'PICKED UP', cash: o.cash! });
  const gross = lines.reduce((s, l) => s + l.cash, 0);
  const cut = Math.min(k.debt, Math.round(gross * SHARK_CUT));
  if (cut > 0) lines.push({ label: 'LOAN SHARK', cash: -cut });
  const won = paid && place === 1;
  return {
    career: {
      ...k,
      day: k.day + 1,
      cash: k.cash + gross - cut,
      debt: k.debt - cut,
      hp: o.wrecked ? 10 : Math.max(1, Math.round(o.hp)),
      kit: { mines: false, spikes: false, fuel: false, sabotage: false },
      extras: [],
      points: k.points + points,
      wins: k.wins + (won ? 1 : 0),
      streak: won ? k.streak + 1 : 0,
      drivers,
      champion,
    },
    payout: { place, lines, total: gross - cut, points, champion: champion && !k.champion },
  };
}

/** Read a saved career back; anything that is not one gives null. */
export function parseCareer(c: Content, json: string | null): Career | null {
  if (!json) return null;
  try {
    const k = JSON.parse(json) as Career;
    if (k.v !== 1 || !c.car.has(k.car) || !Array.isArray(k.drivers) || k.drivers.length !== 12)
      return null;
    if (![k.cash, k.hp, k.points, k.day, k.debt, k.seed].every(Number.isFinite)) return null;
    // a career saved before there were add-ons has none; one that names an add-on since gone loses it
    const ids = (v: unknown): string[] =>
      Array.isArray(v)
        ? v.filter((id): id is string => typeof id === 'string' && c.pickup.has(id))
        : [];
    return { ...k, addons: ids(k.addons), extras: ids(k.extras) };
  } catch {
    return null;
  }
}

/** Read a finished race off its world. */
export function readOutcome(w: World): Outcome {
  const P = w.player;
  const rivals = w.cars.filter((c) => c !== P);
  return {
    order: w.standings().map((c) => (c === P ? 'YOU' : c.name)),
    wrecked: P.wrecked,
    hp: P.hp,
    damage: P.hp0 - P.hp,
    wrecks: P.wrecks,
    cleared: rivals.length > 0 && rivals.every((c) => c.wrecked),
    cash: P.cash,
  };
}

/** Giving up a race: last place, no pay, and the car comes home as it is. */
export function forfeit(w: World): Outcome {
  const P = w.player;
  return {
    order: [...w.cars.filter((c) => c !== P).map((c) => c.name), 'YOU'],
    wrecked: P.wrecked,
    hp: P.hp,
    damage: P.hp0 - P.hp,
    wrecks: 0,
    cleared: false,
  };
}
