/**
 * The numbers of the game's rules that can be tuned by hand: the DEV SETTINGS pane lists them,
 * a `World` takes them as `tuning`, and a rule reads `world.tuning`. Adding one here (and reading
 * it in its rule) is all it takes to put it on the pane. They are for trying things out on one
 * device: an online race always runs on the defaults, so every screen runs the same race.
 */
export interface Tunable {
  key: string;
  /** What the pane calls it, and one line on what it does. */
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  /** The game's own value. */
  value: number;
  unit: 's' | 'px' | 'px/s' | '';
  /** Whether a change is felt at once in a race under way, or from the next race. */
  live: boolean;
}

export const TUNABLES = [
  {
    key: 'rescueGrace',
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
    label: 'COUNTDOWN',
    hint: 'How long the countdown is before the car is put back on the road (0: never)',
    min: 0,
    max: 15,
    step: 1,
    value: 5,
    unit: 's',
    live: true,
  },
  {
    key: 'verge',
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
