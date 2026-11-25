import { z } from 'zod';

/**
 * Track pieces: things a track is dressed with that do more than stand there. A boost tile, a
 * ramp, a flock of chickens and a patch of corn are all ordinary props (`prop.*`) carrying one of
 * the fields below, so every scenery rule, the test range and the track creator can put them down
 * the same way: a prop id, a place and a turn.
 */

const prop = z.string().regex(/^prop\.[a-z0-9-]+$/, 'a prop.* id');
const unit = z.number().min(0).max(1);

/**
 * A flat tile cars drive over, `long` art px along the way it points (the prop's turn) and `wide`
 * across it.
 * - `boost`: a car on it is kicked along the arrow by `push` (art px a second) and its top speed
 *   is `pace` times its own for `seconds`.
 * - `jump`: a ramp. A car crossing it along the arrow faster than `min` is thrown up at `lift`
 *   (art px a second, at the game's base top speed; slower cars get less) and sails over whatever
 *   is `low` enough.
 * - `road`: a piece of track laid off the road (a dirt path, a boardwalk): ground under it drives
 *   like the road itself, and a car on it is not off the course. A row of them is a shortcut.
 * - `vent`: a spout in the ground (a geyser, a steam vent). Every `period` seconds it blows for
 *   `open` seconds, and a car over it then is thrown up at `lift`, however fast it is going.
 */
export const PadSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('boost'),
    long: z.number().positive(),
    wide: z.number().positive(),
    push: z.number().positive(),
    pace: z.number().min(1).max(2),
    seconds: z.number().positive(),
  }),
  z.strictObject({
    kind: z.literal('jump'),
    long: z.number().positive(),
    wide: z.number().positive(),
    lift: z.number().positive(),
    min: z.number().min(0).default(60),
  }),
  z.strictObject({
    kind: z.literal('road'),
    long: z.number().positive(),
    wide: z.number().positive(),
  }),
  z.strictObject({
    kind: z.literal('vent'),
    long: z.number().positive(),
    wide: z.number().positive(),
    lift: z.number().positive(),
    period: z.number().positive(),
    open: z.number().positive(),
  }),
]);
export type PadManifest = z.infer<typeof PadSchema>;

/**
 * A shape in the road's own surface, `long` art px along the way the prop is turned and `wide`
 * across it, `high` at its middle (below zero: a hollow that deep). Cars ride over it: their
 * wheels follow it, so the body tips and rocks, and one that comes over a crest fast leaves the
 * ground.
 * - `bar`: the same height all the way across, rounded off along its length (a speed bump, a dip).
 * - `bowl`: round, deepest in the middle (a pothole).
 * - `wedge`: rising from nothing at its foot to `high` at its lip, where it ends sheer (a ramp).
 * `jolt` (0 to 1) is how much of its speed a car loses to a wheel dropping in, each time it
 * drives into one fast: it is knocked askew and thrown up a little too.
 */
export const MoundSchema = z.strictObject({
  shape: z.enum(['bar', 'bowl', 'wedge']).default('bar'),
  long: z.number().positive(),
  wide: z.number().positive(),
  high: z.number().min(-8).max(12),
  jolt: unit.default(0),
});
export type MoundManifest = z.infer<typeof MoundSchema>;

/**
 * An animal. The prop is where a group of `group` of them lives; they wander within `roam` of
 * it at `walk` and bolt at `run` from a car that comes within `scare` going faster than `shy`.
 * - `ground`: runs about on the ground. One lighter than `flung` (mass 1 is a car) is knocked
 *   into the air by a car and lands on its feet; a heavier one stands like a boulder: the car
 *   bounces off and is hurt by a hard knock.
 * - `bird`: pecks on the ground until scared, then takes off, circles at `height` and comes down
 *   again somewhere near. Nothing hits it.
 * `step` is how high its gait bobs (a rabbit's hop), which only the client reads.
 */
export const CritterSchema = z.strictObject({
  kind: z.enum(['ground', 'bird']),
  group: z.tuple([z.number().int().min(1), z.number().int().min(1).max(12)]),
  roam: z.number().positive(),
  walk: z.number().positive(),
  run: z.number().positive(),
  scare: z.number().positive(),
  shy: z.number().min(0).default(40),
  mass: z.number().positive().default(0.1),
  height: z.number().positive().default(34),
  step: z.number().min(0).default(0.6),
  /** What the client calls out and plays when a car sends it flying or runs into it. */
  cry: z.enum(['cluck', 'baa', 'moo', 'caw', 'squeak', 'snort', 'bellow']).default('squeak'),
  /** Points for the car that bowls it over (light ones only). */
  points: z.number().int().min(0).default(0),
  /**
   * It attacks (heavy ground animals only). A car that moves within `notice` of it is picked
   * out: the animal turns on it and paws the ground for `wind` seconds, then runs at it at
   * `speed` for up to `reach` art px. A car it catches takes `hit` damage and is thrown off at
   * `shove` art px a second. Hit or miss, it is blown for `rest` seconds; a tree stops it dead.
   */
  charge: z
    .strictObject({
      notice: z.number().positive(),
      wind: z.number().positive().default(0.7),
      speed: z.number().positive(),
      reach: z.number().positive().default(220),
      hit: z.number().positive(),
      shove: z.number().positive(),
      rest: z.number().positive().default(3),
    })
    .optional(),
});
export type CritterManifest = z.infer<typeof CritterSchema>;

/** A car (mass 1) knocks an animal lighter than this into the air; a heavier one stops the car. */
export const FLUNG_BELOW = 0.6;

/** The fields a prop may carry to be a track piece. Spread into PropSchema. */
export const pieceFields = {
  pad: PadSchema.optional(),
  mound: MoundSchema.optional(),
  /** A piece of raised deck with rails: the prop that is the same piece with none. */
  bare: z.string().optional(),
  critter: CritterSchema.optional(),
  /**
   * Static props that are not solid: flattened for good by a car that drives over them (long
   * grass, corn, flowers).
   */
  trample: z.boolean().default(false),
  /**
   * Solid static props: it is sprung. A car that touches it is thrown back off it at this many
   * art px a second, unhurt (a fairground bumper).
   */
  bounce: z.number().positive().optional(),
  /**
   * Solid static props: how tall it is, art px. A car in the air higher than this passes over
   * it. Without it nothing gets over.
   */
  low: z.number().positive().optional(),
};

/** One thing in a set laid down by the `along` rule: `ahead` art px on from the spot, `lane`
 * across the road (-1 and 1 are the kerbs; beyond is the verge), turned `rot` from the way the
 * road runs. `row` of them side by side `step` apart, and `n` such rows `gap` apart on down the
 * road. */
const AlongItem = z.strictObject({
  prop,
  ahead: z.number().default(0),
  lane: z.number().min(-4).max(4).default(0),
  rot: z.number().default(0),
  row: z.number().int().min(1).max(12).default(1),
  step: z.number().positive().default(8),
  n: z.number().int().min(1).max(24).default(1),
  gap: z.number().positive().default(12),
});

/**
 * A set of things at chosen spots along the road. The spots are `at` (fractions of the way
 * round), or `pick` finds them: the `count` straightest stretches, or the sharpest bends, kept
 * `apart` (a fraction of the lap) from each other and clear of the start. At a bend, positive
 * lanes are its outside. `mirror` flips every other spot left to right. Nothing is put up on a
 * flyover.
 */
export const AlongRule = z.strictObject({
  rule: z.literal('along'),
  at: z.array(unit).optional(),
  pick: z
    .strictObject({
      where: z.enum(['straight', 'bend']),
      count: z.number().int().min(1).max(40),
      apart: unit.default(0.04),
    })
    .optional(),
  mirror: z.boolean().default(false),
  items: z.array(AlongItem).min(1),
});

/**
 * Fields beside the road: `count` plots of `prop` in rows `step` apart, each between the two
 * `size`s long and deep, `clear` art px back from the kerb and lined up with the road.
 */
export const FieldRule = z.strictObject({
  rule: z.literal('field'),
  count: z.number().int().positive(),
  prop,
  long: z.tuple([z.number().positive(), z.number().positive()]),
  deep: z.tuple([z.number().positive(), z.number().positive()]),
  step: z.number().positive(),
  clear: z.number().min(0),
});
