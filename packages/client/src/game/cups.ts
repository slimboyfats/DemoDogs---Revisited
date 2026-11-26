import { BASE_SPEED, TUNE_MAX } from '@demodogs/shared';
import { Rng, sampleTrack, type Content, type Entrant, type Setup } from '@demodogs/sim';
import {
  SHARK_CUT,
  playerSetup,
  rivalEntry,
  type Buy,
  type Career,
  type Outcome,
  type Payout,
} from './career';

/**
 * Tournaments: a paid entry, a fixed field, several rounds, and the garage open between them. The
 * car goes from round to round as it is, dents and all, so what each round pays is spent on fixing
 * it or on making it quicker for the next. Six kinds, each scored its own way; a tournament names
 * no venue, car, add-on or modifier, so whatever the content holds is what it is run on.
 */
export type CupKind = 'cup' | 'last' | 'derby' | 'bounty' | 'trial' | 'iron';

export interface CupDef {
  id: string;
  name: string;
  kind: CupKind;
  blurb: string;
  rounds: number;
  rivals: number;
  /** How strong the field is: 0 backyard, 1 junkyard, 2 big league. */
  tier: 0 | 1 | 2;
  fee: number;
  /** Paid for winning a round; half for second, a quarter for third. */
  round: number;
  /** Paid at the end for first, second and third overall, with these ladder points. */
  purse: readonly [number, number, number];
  ladder: readonly [number, number, number];
  /** Trophies needed before it will take your entry. */
  needs: number;
  /** World modifiers in every round: one, and two in the later rounds. */
  storm?: boolean;
}

export const KINDS: Readonly<Record<CupKind, { name: string; rule: string }>> = {
  cup: { name: 'CUP', rule: 'Points for every place. Most points takes the cup.' },
  last: { name: 'ELIMINATION', rule: 'Last home in each round is out. Be the last dog left.' },
  derby: { name: 'DERBY LEAGUE', rule: 'Points for outlasting the rest, and 2 for every wreck.' },
  bounty: {
    name: 'BOUNTY HUNT',
    rule: 'Wrecks score and pay. Beat the WANTED car home for the bounty.',
  },
  trial: { name: 'TIME TRIAL', rule: 'Alone against the clock. Medals pay; a wreck gets none.' },
  iron: { name: 'ENDURANCE', rule: 'Twice the laps and no repairs until it is over.' },
};

export const CUPS: readonly CupDef[] = [
  {
    id: 'puppy',
    name: 'PUPPY CUP',
    kind: 'cup',
    blurb: 'Three short races against the backyard.',
    rounds: 3,
    rivals: 3,
    tier: 0,
    fee: 150,
    round: 300,
    purse: [1500, 800, 400],
    ladder: [6, 4, 2],
    needs: 0,
  },
  {
    id: 'stopwatch',
    name: 'STOPWATCH TRIALS',
    kind: 'trial',
    blurb: 'Three tracks, nobody in the way.',
    rounds: 3,
    rivals: 0,
    tier: 0,
    fee: 100,
    round: 450,
    purse: [1800, 1000, 500],
    ladder: [5, 3, 1],
    needs: 0,
  },
  {
    id: 'scrap',
    name: 'SCRAP LEAGUE',
    kind: 'derby',
    blurb: 'Three derbies, six cars in the bowl.',
    rounds: 3,
    rivals: 5,
    tier: 0,
    fee: 300,
    round: 500,
    purse: [2500, 1400, 700],
    ladder: [8, 5, 3],
    needs: 0,
  },
  {
    id: 'last-dog',
    name: 'LAST DOG OUT',
    kind: 'last',
    blurb: 'Five start. One goes home each round.',
    rounds: 4,
    rivals: 4,
    tier: 1,
    fee: 500,
    round: 600,
    purse: [4500, 2200, 1100],
    ladder: [14, 8, 4],
    needs: 1,
  },
  {
    id: 'bounty',
    name: 'BOUNTY RUN',
    kind: 'bounty',
    blurb: 'Three races with a price on every bumper.',
    rounds: 3,
    rivals: 4,
    tier: 1,
    fee: 600,
    round: 700,
    purse: [5000, 2500, 1200],
    ladder: [14, 8, 4],
    needs: 1,
  },
  {
    id: 'storm',
    name: 'STORM SERIES',
    kind: 'cup',
    blurb: 'Four races in whatever the sky throws down.',
    rounds: 4,
    rivals: 4,
    tier: 1,
    fee: 800,
    round: 900,
    purse: [7000, 3500, 1700],
    ladder: [18, 10, 5],
    needs: 2,
    storm: true,
  },
  {
    id: 'iron-dog',
    name: 'IRON DOG',
    kind: 'iron',
    blurb: 'Three long races on one set of bodywork.',
    rounds: 3,
    rivals: 4,
    tier: 2,
    fee: 1200,
    round: 1500,
    purse: [10000, 5000, 2500],
    ladder: [24, 14, 7],
    needs: 3,
  },
  {
    id: 'grand',
    name: 'GRAND PRIX',
    kind: 'cup',
    blurb: 'Five races against the best six on the ladder.',
    rounds: 5,
    rivals: 5,
    tier: 2,
    fee: 2000,
    round: 2000,
    purse: [16000, 8000, 4000],
    ladder: [32, 18, 9],
    needs: 4,
  },
];

/** Points for each place in a round. */
export const POINTS: readonly number[] = [10, 7, 5, 3, 2, 1];
const BOUNTY_POINTS: readonly number[] = [6, 4, 3, 2, 1, 0];
const WRECK_POINTS: Readonly<Record<CupKind, number>> = {
  cup: 0,
  last: 0,
  derby: 2,
  bounty: 3,
  trial: 0,
  iron: 0,
};
/**
 * A time trial's medals, as an average speed round the whole distance in units of BASE_SPEED:
 * gold, silver, bronze. Set by driving them: the game's own driver alone in the stock first car
 * averages 0.69 to 0.76 on the built-in tracks and 0.78 to 0.86 with every upgrade, so bronze is
 * there for a clean run, silver wants upgrades and gold wants a better car or a better driver.
 */
export const PAR: readonly [number, number, number] = [0.84, 0.76, 0.68];
export const MEDALS = ['NO MEDAL', 'BRONZE', 'SILVER', 'GOLD'] as const;
/** What a wreck is patched up to between rounds when repairs are not allowed. */
const SEALED_PATCH = 30;

export interface CupRival {
  /** Index into the career's `drivers`. */
  i: number;
  points: number;
  out: boolean;
}

/** A tournament in progress. */
export interface CupRun {
  id: string;
  /** The round to be run next, from 0. */
  round: number;
  seed: number;
  rivals: CupRival[];
  points: number;
  /** A time trial's medals so far, one a round: 3 gold, 2 silver, 1 bronze, 0 none. */
  medals: number[];
  /** No repairs while it runs. */
  sealed: boolean;
}

export const cupDef = (id: string): CupDef | undefined => CUPS.find((d) => d.id === id);
export const trophyCount = (k: Career): number => Object.keys(k.trophies).length;
/** Why a tournament will not take the entry, or null if it will. */
export function barred(k: Career, d: CupDef): string | null {
  if (k.cup) return 'One tournament at a time.';
  const short = d.needs - trophyCount(k);
  if (short > 0) return `Needs ${short} more ${short === 1 ? 'trophy' : 'trophies'}.`;
  if (d.fee > k.cash) return 'Not enough cash for the entry.';
  return null;
}

/** The drivers of a field: the tier's own four first, then the nearest on the ladder list. */
function fieldOf(d: CupDef): number[] {
  const mid = d.tier === 2 ? 1.5 : d.tier === 1 ? 5.5 : 9.5;
  return Array.from({ length: 12 }, (_, i) => i)
    .sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid) || b - a)
    .slice(0, d.rivals);
}

/** Pay the entry and draw the field. */
export function enterCup(k: Career, id: string): Buy {
  const d = cupDef(id);
  if (!d) return { ok: false, why: 'No such tournament.' };
  const why = barred(k, d);
  if (why) return { ok: false, why };
  return {
    ok: true,
    career: {
      ...k,
      cash: k.cash - d.fee,
      cup: {
        id,
        round: 0,
        seed: (k.seed + k.day * 6151 + d.fee) >>> 0,
        rivals: fieldOf(d).map((i) => ({ i, points: 0, out: false })),
        points: 0,
        medals: [],
        sealed: d.kind === 'iron',
      },
    },
  };
}

/** Walk away from a tournament: the entry fee is gone and nothing is won. */
export const withdraw = (k: Career): Career => ({ ...k, cup: null });

export interface CupRound {
  def: CupDef;
  /** From 0. */
  round: number;
  venue: string;
  seed: number;
  field: Entrant[];
  player: Setup;
  /** No tow truck in a tournament: a wreck is out of the round. */
  knockout: true;
  laps?: number;
  modifiers: string[];
  /** Bounty hunt: the name of the car with the price on it, and the price. */
  mark?: string;
  bounty?: number;
  /** Time trial: the times for gold, silver and bronze (s). */
  par?: [number, number, number];
}

const sorted = <T extends { id: string }>(items: Iterable<T>): T[] =>
  [...items].sort((a, b) => (a.id < b.id ? -1 : 1));

/** The next round of the tournament being run: where, against whom, and under what. */
export function cupRound(c: Content, k: Career): CupRound | null {
  const run = k.cup;
  const def = run && cupDef(run.id);
  if (!run || !def) return null;
  const kind = def.kind === 'derby' ? 'derby' : 'race';
  const venues = new Rng(run.seed).shuffle(
    sorted(c.venue.values()).filter((v) => c.mode.get(v.mode)?.kind === kind),
  );
  if (venues.length === 0) return null;
  const venue = venues[run.round % venues.length]!;
  const rng = new Rng(run.seed + (run.round + 1) * 7919);
  const seed = rng.int(2 ** 31);
  const field = run.rivals.filter((r) => !r.out).map((r) => rivalEntry(c, k.drivers[r.i]!, r.i));
  const out: CupRound = {
    def,
    round: run.round,
    venue: venue.id,
    seed,
    field,
    player: playerSetup(c, k),
    knockout: true,
    modifiers: [],
  };
  const laps = c.mode.get(venue.mode)?.laps ?? 3;
  if (def.kind === 'iron') out.laps = laps * 2;
  if (def.storm) {
    const mods = rng.shuffle(sorted(c.modifier.values()).map((m) => m.id));
    out.modifiers = mods.slice(0, run.round * 2 >= def.rounds ? 2 : 1).sort();
  }
  if (def.kind === 'bounty' && field.length) {
    // the price is on a different head each round, and that car is the best one out there
    const at = (run.round + (run.seed % field.length)) % field.length;
    const m = field[at]!;
    field[at] = {
      ...m,
      tune: { engine: TUNE_MAX, tyres: TUNE_MAX, armor: TUNE_MAX },
      skill: (m.skill ?? 0.9) + 0.04,
    };
    out.mark = m.name;
    out.bounty = def.round;
  }
  if (def.kind === 'trial' && venue.track) {
    const dist = sampleTrack(venue.track.points, 4).len * laps;
    out.par = PAR.map((p) => Math.round(dist / (BASE_SPEED * p))) as [number, number, number];
  }
  return out;
}

export interface CupRow {
  name: string;
  paint: string;
  points: number;
  me: boolean;
  out: boolean;
}

/** The tournament's table, best first. The player wins a tie. */
export function cupTable(k: Career): CupRow[] {
  const run = k.cup;
  if (!run) return [];
  const rows: CupRow[] = run.rivals.map((r) => ({
    name: k.drivers[r.i]!.name,
    paint: k.drivers[r.i]!.paint,
    points: r.points,
    me: false,
    out: r.out,
  }));
  rows.push({ name: 'YOU', paint: '#ffffff', points: run.points, me: true, out: false });
  return rows.sort((a, b) => b.points - a.points || (a.me ? -1 : b.me ? 1 : 0));
}

/** What a results screen says about the tournament after a round. */
export interface CupReport {
  name: string;
  kind: CupKind;
  /** The round just run, from 1, of how many. */
  round: number;
  rounds: number;
  /** Points (or medal) the player took from the round. */
  scored: number;
  table: CupRow[];
  /** Elimination: who went home. */
  cut?: string;
  /** Time trial: the time and the medal it earned, 0 to 3. */
  time?: number;
  medal?: number;
  /** Set once the tournament is over: where the player came (4 and worse win nothing). */
  place?: number;
}

export interface CupPayout extends Payout {
  cup: CupReport;
}

const share = (n: number, k: number): number => Math.round((n * k) / 50) * 50;

/** Settle a round: score it, pay it, carry the car home, and close the tournament after the last. */
export function settleCup(
  c: Content,
  k: Career,
  o: Outcome,
): { career: Career; payout: CupPayout } | null {
  const r = cupRound(c, k);
  const run = k.cup;
  if (!r || !run) return null;
  const def = r.def;
  const place = o.order.indexOf('YOU') + 1;
  const lines: Payout['lines'] = [];
  const rivals = run.rivals.map((x) => ({ ...x }));
  const nameOf = (x: CupRival): string => k.drivers[x.i]!.name;
  const table = def.kind === 'bounty' ? BOUNTY_POINTS : POINTS;
  const perWreck = WRECK_POINTS[def.kind];
  let scored = 0;
  let over = run.round + 1 >= def.rounds;
  let finalPlace: number | undefined;
  const report: Partial<CupReport> = {};
  const medals = [...run.medals];

  if (def.kind === 'trial') {
    const t = o.wrecked ? undefined : o.time;
    const medal = t === undefined || !r.par ? 0 : 3 - r.par.filter((p) => t > p).length;
    medals.push(medal);
    scored = medal;
    if (medal > 0) lines.push({ label: MEDALS[medal]!, cash: share(def.round, medal / 3) });
    report.medal = medal;
    if (t !== undefined) report.time = t;
    if (over) {
      const sum = medals.reduce((s, m) => s + m, 0);
      finalPlace =
        sum >= def.rounds * 3 - 1 ? 1 : sum >= def.rounds * 2 ? 2 : sum >= def.rounds ? 3 : 4;
    }
  } else if (def.kind === 'last') {
    // the last of those still in goes home; if that is you, the tournament is over
    const last = o.order.at(-1);
    const left = rivals.filter((x) => !x.out);
    if (last === 'YOU' || place === 0) {
      over = true;
      finalPlace = left.length + 1;
    } else {
      const gone = left.find((x) => nameOf(x) === last) ?? left.at(-1);
      if (gone) {
        gone.out = true;
        report.cut = nameOf(gone);
      }
      for (const x of rivals) if (!x.out) x.points++;
      scored = 1;
      if (rivals.every((x) => x.out)) {
        over = true;
        finalPlace = 1;
      }
    }
  } else {
    scored = (place > 0 ? (table[place - 1] ?? 0) : 0) + perWreck * o.wrecks;
    for (const x of rivals) {
      const at = o.order.indexOf(nameOf(x));
      x.points += (at >= 0 ? (table[at] ?? 0) : 0) + perWreck * (o.wrecksOf?.[nameOf(x)] ?? 0);
    }
  }

  // the round's money: the first three are paid, a wreck is not (in a derby a wreck is a placing)
  const paid = place >= 1 && place <= 3 && (def.kind === 'derby' || !o.wrecked);
  if (def.kind !== 'trial' && paid) {
    lines.push({
      label: `ROUND ${run.round + 1}: ${['1ST', '2ND', '3RD'][place - 1]}`,
      cash: share(def.round, [1, 0.5, 0.25][place - 1]!),
    });
  }
  if ((def.kind === 'bounty' || def.kind === 'derby') && o.wrecks > 0)
    lines.push({ label: `WRECKS ×${o.wrecks}`, cash: share(def.round, 0.3) * o.wrecks });
  if (r.mark && !o.wrecked && place > 0) {
    const at = o.order.indexOf(r.mark);
    if (at < 0 || at >= place) lines.push({ label: `BOUNTY: ${r.mark}`, cash: r.bounty ?? 0 });
  }
  if (!o.wrecked && (o.cash ?? 0) > 0) lines.push({ label: 'PICKED UP', cash: o.cash! });

  const points = run.points + scored;
  const mid: Career = { ...k, cup: { ...run, rivals, points, medals, round: run.round + 1 } };
  const rows = cupTable(mid);
  let ladder = 0;
  const drivers = k.drivers.map((d) => ({ ...d }));
  const trophies = { ...k.trophies };
  if (over) {
    finalPlace ??= rows.findIndex((x) => x.me) + 1;
    if (finalPlace <= 3) {
      lines.push({
        label: `${def.name}: ${['WON', '2ND', '3RD'][finalPlace - 1]}`,
        cash: def.purse[finalPlace - 1]!,
      });
      ladder = def.ladder[finalPlace - 1]!;
      trophies[def.id] = Math.min(trophies[def.id] ?? 3, finalPlace);
    }
    // the rivals who beat you to the places take their ladder points too
    rows
      .filter((x) => !x.me)
      .slice(0, 3)
      .forEach((x, at) => {
        const d = drivers.find((y) => y.name === x.name);
        if (d && def.kind !== 'trial') d.points += Math.ceil(def.ladder[at]! / 4);
      });
  }
  const gross = lines.reduce((s, l) => s + l.cash, 0);
  const cut = Math.min(k.debt, Math.round(gross * SHARK_CUT));
  if (cut > 0) lines.push({ label: 'LOAN SHARK', cash: -cut });
  const hp = o.wrecked ? (run.sealed && !over ? SEALED_PATCH : 10) : Math.max(1, Math.round(o.hp));
  const won = over && finalPlace === 1;
  return {
    career: {
      ...k,
      day: k.day + 1,
      cash: k.cash + gross - cut,
      debt: k.debt - cut,
      hp,
      kit: { mines: false, spikes: false, fuel: false, sabotage: false },
      extras: [],
      points: k.points + ladder,
      wins: k.wins + (won ? 1 : 0),
      drivers,
      trophies,
      cup: over ? null : mid.cup,
    },
    payout: {
      place,
      lines,
      total: gross - cut,
      points: ladder,
      champion: false,
      cup: {
        name: def.name,
        kind: def.kind,
        round: run.round + 1,
        rounds: def.rounds,
        scored,
        table: rows,
        ...report,
        ...(over ? { place: finalPlace! } : {}),
      },
    },
  };
}

/** A tournament read back from a save: kept only if it is still one that can be run. */
export function parseCup(k: { drivers: unknown[] }, raw: unknown): CupRun | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<CupRun>;
  const def = typeof r.id === 'string' ? cupDef(r.id) : undefined;
  const whole = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0;
  if (!def || !whole(r.round) || r.round >= def.rounds || !whole(r.seed) || !whole(r.points))
    return null;
  if (!Array.isArray(r.rivals) || !Array.isArray(r.medals) || !r.medals.every(whole)) return null;
  const rivals: CupRival[] = [];
  for (const x of r.rivals as Partial<CupRival>[]) {
    if (!x || !whole(x.i) || x.i >= k.drivers.length || !whole(x.points)) return null;
    rivals.push({ i: x.i, points: x.points, out: x.out === true });
  }
  return {
    id: def.id,
    round: r.round,
    seed: r.seed,
    rivals,
    points: r.points,
    medals: [...r.medals],
    sealed: def.kind === 'iron',
  };
}

/** 83.4 s as 1:23.4. */
export const clock = (t: number): string => {
  const s = Math.max(0, t);
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
};
