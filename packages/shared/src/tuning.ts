/**
 * The numbers of the game's rules that can be tuned by hand: the DEV SETTINGS pane lists them,
 * a `World` takes them as `tuning`, and a rule reads `world.tuning`. Adding one here (and reading
 * it in its rule) is all it takes to put it on the pane. They are for trying things out on one
 * device: an online race always runs on the defaults, so every screen runs the same race.
 */
export type TuneGroup = 'CARS' | 'RACE' | 'OFF COURSE' | 'SIDE RAMPS';

export interface Tunable {
  key: string;
  /** The heading it is listed under. */
  group: TuneGroup;
  /** What the pane calls it, and one line on what it does. */
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  /** The game's own value. */
  value: number;
  /** `x` is a multiplier of the game's own; `0=` names what zero means instead of a number. */
  unit: 's' | 'px' | 'px/s' | 'x' | '';
  zero?: string;
  /** Whether a change is felt at once in a race under way, or from the next race. */
  live: boolean;
}

/** A multiplier of one of the game's own numbers: 1 is the game as it is. */
const times = <K extends string>(
  key: K,
  group: TuneGroup,
  label: string,
  hint: string,
  min: number,
  max: number,
) => ({ key, group, label, hint, min, max, step: 0.05, value: 1, unit: 'x', live: true }) as const;

export const TUNABLES = [
  times('topSpeed', 'CARS', 'TOP SPEED', 'How fast every car can go', 0.5, 2),
  times('accel', 'CARS', 'ACCELERATION', 'How quickly every car picks up speed', 0.5, 2.5),
  times('grip', 'CARS', 'GRIP', 'How well tyres hold: less slides more', 0.3, 2),
  times('botSpeed', 'CARS', 'BOT SPEED', 'How fast the bots can go, next to you', 0.6, 1.4),
  {
    key: 'boostPower',
    group: 'CARS',
    label: 'BOOST POWER',
    hint: 'How much faster a car goes on boost',
    min: 1,
    max: 2,
    step: 0.01,
    value: 1.33,
    unit: 'x',
    live: true,
  },
  times('boostDrain', 'CARS', 'BOOST DRAIN', 'How fast boost is used up', 0.25, 3),
  times('boostRefill', 'CARS', 'BOOST REFILL', 'How fast boost comes back by itself', 0, 6),
  {
    key: 'offroad',
    group: 'CARS',
    label: 'OFF ROAD SLOWDOWN',
    hint: 'How much of its top speed a car loses off the road',
    min: 0,
    max: 0.8,
    step: 0.02,
    value: 0.44,
    unit: '',
    live: true,
  },
  times(
    'gravity',
    'CARS',
    'GRAVITY',
    'How hard cars in the air are pulled down: less is longer jumps',
    0.3,
    2,
  ),
  times('damage', 'RACE', 'DAMAGE', 'How much every blow to a car hurts (0: none)', 0, 3),
  times(
    'crateTime',
    'RACE',
    'CRATE WAIT',
    'How long a crate takes to come back once taken',
    0.1,
    4,
  ),
  {
    key: 'laps',
    group: 'RACE',
    label: 'LAPS',
    hint: 'How many laps a race is',
    min: 0,
    max: 9,
    step: 1,
    value: 0,
    unit: '',
    zero: "TRACK'S OWN",
    live: false,
  },
  {
    key: 'rivals',
    group: 'RACE',
    label: 'RIVALS',
    hint: 'How many bots are in the field',
    min: 0,
    max: 5,
    step: 1,
    value: 5,
    unit: '',
    live: false,
  },
  {
    key: 'rescueGrace',
    group: 'OFF COURSE',
    label: 'OFF COURSE DELAY',
    hint: 'How long off the course in a race before the countdown shows',
    min: 0,
    max: 6,
    step: 0.5,
    value: 1.5,
    unit: 's',
    live: true,
  },
  {
    key: 'rescueCount',
    group: 'OFF COURSE',
    label: 'COUNTDOWN',
    hint: 'How long the countdown is before the car is put back on the road',
    min: 0,
    max: 15,
    step: 1,
    value: 5,
    unit: 's',
    zero: 'OFF',
    live: true,
  },
  {
    key: 'verge',
    group: 'OFF COURSE',
    label: 'OFF COURSE MARGIN',
    hint: "How far past the road's edge still counts as on the course",
    min: 16,
    max: 240,
    step: 8,
    value: 48,
    unit: 'px',
    live: true,
  },
  {
    key: 'rescueSpeed',
    group: 'OFF COURSE',
    label: 'PUT BACK SPEED',
    hint: 'How fast the car is rolling when it is put back on the road',
    min: 0,
    max: 200,
    step: 10,
    value: 40,
    unit: 'px/s',
    live: true,
  },
  {
    key: 'slipGap',
    group: 'SIDE RAMPS',
    label: 'SIDE RAMP SPACING',
    hint: 'How far apart the ramps up the sides of raised road are',
    min: 120,
    max: 900,
    step: 20,
    value: 300,
    unit: 'px',
    live: false,
  },
  {
    key: 'slipWide',
    group: 'SIDE RAMPS',
    label: 'SIDE RAMP WIDTH',
    hint: 'How wide each ramp up the side of raised road is',
    min: 32,
    max: 140,
    step: 4,
    value: 52,
    unit: 'px',
    live: false,
  },
  {
    key: 'slipRun',
    group: 'SIDE RAMPS',
    label: 'SIDE RAMP LENGTH',
    hint: 'How long a side ramp is for each px it climbs: more is gentler',
    min: 2,
    max: 7,
    step: 0.2,
    value: 3.4,
    unit: '',
    live: false,
  },
] as const satisfies readonly Tunable[];

export type TuningKey = (typeof TUNABLES)[number]['key'];
export type Tuning = Record<TuningKey, number>;

export const DEFAULT_TUNING: Tuning = Object.fromEntries(
  TUNABLES.map((t) => [t.key, t.value]),
) as Tuning;

/** One value brought onto its tunable's range and step. */
function fit(t: Tunable, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return t.value;
  const n = t.min + Math.round((Math.min(t.max, Math.max(t.min, v)) - t.min) / t.step) * t.step;
  return Math.round(n * 1000) / 1000;
}

/** A whole tuning from whatever was written down: unknown keys dropped, the rest fitted. */
export function fitTuning(raw: unknown): Tuning {
  const from = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(TUNABLES.map((t) => [t.key, fit(t, from[t.key])])) as Tuning;
}
