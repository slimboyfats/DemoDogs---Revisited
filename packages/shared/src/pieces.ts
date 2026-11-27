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
 * - `switch`: a plate in the ground. A car driving onto it opens every switched gate (a prop with
 *   a `gate` of `period` 0) within `reach` for that gate's `open` seconds.
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
    /** What it is laid in (looks only): a jump piece that joins it takes the same look. */
    skin: z.enum(['dirt', 'wood', 'rock', 'tarmac', 'boards']).optional(),
    /**
     * How loose it lies under a car (0 firm, 1 a rattletrap): it drives as fast as road, but the
     * car is thrown a little from side to side and rocks as it goes.
     */
    wobble: z.number().min(0).max(1).optional(),
  }),
  z.strictObject({
    kind: z.literal('switch'),
    long: z.number().positive(),
    wide: z.number().positive(),
    /** It opens every switched gate within this many art px of it. */
    reach: z.number().positive(),
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
 * One half of a jump: a block of raised ground laid where the prop stands, `long` art px along
 * its turn and `wide` across it, with sheer sides and square ends. It is a piece of track as well
 * (give it a `road` pad as big), so it drives like the road.
 * - `up`: the takeoff. It rises from the ground at its back to `high` at its front, where it ends
 *   sheer; a car leaving it faster than `min` is thrown up at `lift` (as off a ramp tile).
 * - `down`: the landing. It stands `high` at its back, sheer, and runs down to the ground at its
 *   front. A car that falls short of it is left on the ground below, against its face.
 * A takeoff with a landing ahead of it is a gap that scenery keeps out of. Each looks like the
 * way it joins (the client's choice): a takeoff like the ground it is driven onto from, a
 * landing like the ground it leads on to.
 */
export const LeapSchema = z.strictObject({
  way: z.enum(['up', 'down']),
  long: z.number().min(40).max(400),
  wide: z.number().min(24).max(200),
  high: z.number().positive().max(60),
  lift: z.number().min(0).default(0),
  min: z.number().min(0).default(80),
  /**
   * A takeoff whose lip pumps on a beat: a flap across it (the prop `plate`, drawn by the client,
   * never placed) stands up for `up` seconds of every `period` and then throws at `lift`; while
   * it lies flat the takeoff throws only `low` of that, which falls short.
   */
  pump: z
    .strictObject({
      period: z.number().positive(),
      up: z.number().positive(),
      low: unit.default(0.5),
      plate: z.string().regex(/^prop\.[a-z0-9-]+$/, 'a prop.* id'),
    })
    .optional(),
});
export type LeapManifest = z.infer<typeof LeapSchema>;

/**
 * A gate: a solid static prop that sinks into the ground to let cars by and rises again. With a
 * `period` it keeps a beat, down for `open` seconds of every `period` (`shift`, 0 to 1, is how far
 * into the beat it starts, the same for every gate with the same numbers, so a row moves as one;
 * `wave` makes a row move as a wave instead).
 * With none it stands until a `switch` plate within reach is driven over, then is down for `open`
 * seconds. It never rises onto a car: it waits for the car to clear it.
 */
export const GateSchema = z.strictObject({
  period: z.number().min(0).default(0),
  open: z.number().positive().default(3),
  shift: unit.default(0),
  /**
   * With a `period`: art px across a row for one whole beat. Each gate's beat is then shifted by
   * where it stands across its own turn, so a row of them sinks and rises as a wave that runs
   * along it, and the way through is a gap that moves. 0: they all move as one.
   */
  wave: z.number().min(0).default(0),
});
export type GateManifest = z.infer<typeof GateSchema>;

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
  cry: z
    .enum([
      'cluck',
      'baa',
      'moo',
      'caw',
      'squeak',
      'snort',
      'bellow',
      'click',
      'quack',
      'toot',
      'honk',
    ])
    .default('squeak'),
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
  leap: LeapSchema.optional(),
  gate: GateSchema.optional(),
  /**
   * A signal: a lamp that shows the beat of the nearest thing on a beat within `reach` art px (a
   * gate with a `period`, a vent, a takeoff that pumps), so a driver can read it from far off. Looks only: the client
   * flips its look's poses, red while that is shut, amber when it is about to change, green
   * while it is open. The sim does nothing with it.
   */
  signal: z.strictObject({ reach: z.number().positive() }).optional(),
  /**
   * A crate stand for a secret way (a yellow crate floats over it): a car that drives through it
   * gets every pickup listed, and it comes back as the mode's pickups do. Not solid.
   */
  gives: z
    .array(z.string().regex(/^pickup\.[a-z0-9-]+$/, 'a pickup.* id'))
    .min(1)
    .optional(),
  /** A piece of raised deck with rails: the prop that is the same piece with none. */
  bare: z.string().optional(),
  critter: CritterSchema.optional(),
  /**
   * Something comes out of it, for show (the client's alone; the sim never knows): `what`, from
   * the place `at` (forward, sideways and up from the middle of its foot, art px), about `rate`
   * puffs or drops a second.
   * - `smoke`, `steam`: a column the wind carries off (a chimney, a locomotive's funnel).
   * - `water`: thrown straight up, falling back all round (a fountain).
   * - `jets`: two jets of water thrown out level, opposite ways, turning at `spin` rad a second
   *   (a lawn sprinkler).
   * - `sparks`: a shower of sparks in fits and starts (a welder at work).
   */
  spout: z
    .strictObject({
      what: z.enum(['smoke', 'steam', 'water', 'jets', 'sparks']),
      at: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
      rate: z.number().positive().default(8),
      spin: z.number().default(0),
    })
    .optional(),
  /**
   * It floats (looks only; give it `solid: false`): it is drawn `high` art px up in the air,
   * rising and sinking a little and drifting `drift` art px round the spot it was put at, and
   * its shadow lies on the ground under it (a hot-air balloon tethered beside the road).
   */
  float: z
    .strictObject({ high: z.number().positive(), drift: z.number().min(0).default(8) })
    .optional(),
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

/**
 * Things that travel: a line of `count` of `prop` (an animal, or anything with a `critter`: a
 * tractor, a train's wagons), `gap` art px apart behind a `lead` if there is one, that sets out
 * along a way every `every` seconds at `speed` art px a second. The way is a crossing of the road
 * (`cross`: at fraction `at` of the way round, square across it unless `skew`ed, from `reach` px
 * beyond the one edge to `far` px beyond the other), a run beside it (`beside`: from fraction
 * `from` to `to`, `lane` across as in the `along` rule), or `points` (offsets from the middle of
 * the map, as the `place` rule's are). At the far end they are gone until the next time round;
 * with `back` they wait there and come back the way they went. `wide` spreads them to either
 * side of the way (a flock, not a file). `ends` is a prop stood at each end of the way, turned
 * along it (a shed a train comes out of); `rails` has the client draw a railway under it.
 * Where each of them is is a matter of the clock alone, so it can be read ahead (a `signal`
 * within reach of the way shows red while something is on it). Scenery keeps off the way.
 */
export const TrekRule = z.strictObject({
  rule: z.literal('trek'),
  prop,
  lead: prop.optional(),
  count: z.number().int().min(1).max(12).default(1),
  gap: z.number().positive().default(10),
  wide: z.number().min(0).default(0),
  cross: z
    .strictObject({
      at: unit,
      reach: z.number().positive().default(110),
      far: z.number().positive().optional(),
      skew: z.number().min(-1).max(1).default(0),
      flip: z.boolean().default(false),
    })
    .optional(),
  beside: z.strictObject({ from: unit, to: unit, lane: z.number().min(-8).max(8) }).optional(),
  points: z
    .array(z.tuple([z.number(), z.number()]))
    .min(2)
    .max(24)
    .optional(),
  speed: z.number().positive(),
  every: z.number().positive(),
  shift: unit.default(0),
  back: z.boolean().default(false),
  ends: prop.optional(),
  rails: z.boolean().default(false),
});
