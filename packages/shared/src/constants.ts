/** The sim runs at a fixed 60 ticks a second, whatever the display rate. */
export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;

/** A car's hull is two circles on its centre line. */
export const CAR_RADIUS = 6.2;
export const CAR_OFFSET = 5.5;

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
