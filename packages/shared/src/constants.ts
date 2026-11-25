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
 * crater, a soft road), damage, and an item that slows it (a lead collar, a runt ray).
 */
export const HELD = { rough: 1, hill: 2, sticky: 4, hurt: 8, weighed: 16 } as const;
