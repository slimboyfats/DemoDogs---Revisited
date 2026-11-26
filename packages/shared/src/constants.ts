/** The sim runs at a fixed 60 ticks a second, whatever the display rate. */
export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;

/** Downward acceleration for cars, props and debris, in art pixels per second squared. */
export const GRAVITY = 420;

/** Every car's top speed before its stats, in art pixels per second. */
export const BASE_SPEED = 178;

/** What one level of each upgrade adds to a car's stats (engine: speed and accel). */
export const TUNE_STEP = { speed: 0.035, accel: 0.07, grip: 0.05, armor: 0.15 } as const;
/** The highest level of an upgrade. */
export const TUNE_MAX = 3;

/** Cars in a field: the player plus rivals. */
export const FIELD_SIZE = 6;

/**
 * How far up a flyover deck piece's road surface is in its look, art px: a piece stands this far
 * below the height cars ride at on it.
 */
export const DECK_SURFACE = 4;

/** Seconds a rebuilding prop takes to fly back together before it stands again. */
export const REBUILD_TIME = 2.4;

/**
 * What is holding a car back this tick (`Car.held`, a set of these bits), for the HUD to name:
 * rough ground off the road, a hill it is climbing, something sticky under it (mud, glue, a
 * crater, a soft road), water it is wading, lava it is burning in, damage, and an item that slows it (a lead collar, a runt ray).
 */
export const HELD = {
  rough: 1,
  hill: 2,
  sticky: 4,
  hurt: 8,
  weighed: 16,
  wet: 32,
  hot: 64,
} as const;

/**
 * How hard the rivals are to beat. `pace` is added to every rival's skill (its top speed),
 * `wits` scales how sharp it is (how soon it fires, how well it holds its line), `ease` is how
 * much a rival far ahead of the humans backs off and `press` how much one far behind is helped.
 */
export const DIFFICULTY = {
  easy: { pace: -0.09, wits: 0.45, ease: 0.86, press: 1.03 },
  normal: { pace: -0.03, wits: 1, ease: 0.9, press: 1.07 },
  hard: { pace: 0.03, wits: 1.4, ease: 0.97, press: 1.09 },
} as const;
export type Difficulty = keyof typeof DIFFICULTY;
export const DIFFICULTIES = Object.keys(DIFFICULTY) as Difficulty[];

/** How far a car's body rides over the ground its wheels are on, art px on a car of its own size. */
export const BODY_UP = 0.6;
