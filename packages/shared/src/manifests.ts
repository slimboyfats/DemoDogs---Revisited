import { z } from 'zod';

/**
 * Manifest schemas. Every content item is a folder with a manifest.json; its id is
 * `<type>.<name>` and the type decides the schema. An item may `extends` another item of the same
 * type: the loader merges the base under it (shallow, top-level keys) before validation.
 */

const hex = z.string().regex(/^#[0-9a-f]{6}$/i, 'a #rrggbb colour');
const id = (type: string) =>
  z.string().regex(new RegExp(`^${type}\\.[a-z0-9-]+$`), `a ${type}.* id`);
const unit = z.number().min(0).max(1);

export const MetaSchema = z.strictObject({
  name: z.string().min(1),
  description: z.string().min(1),
  since: z.string().regex(/^core@\d+\.\d+\.\d+$/),
});

const base = {
  schemaVersion: z.literal(1),
  meta: MetaSchema,
  extends: z.string().optional(),
};

export const CarSchema = z.strictObject({
  ...base,
  id: id('car'),
  /** Default paint for the player's copy; rivals get their own. */
  paint: hex,
  /** What it costs in the career's car shop; the cheapest is the car a career starts in. */
  price: z.number().int().min(0),
  /** Multipliers around 1.0. */
  stats: z.strictObject({
    speed: z.number().min(0.7).max(1.3),
    accel: z.number().min(0.6).max(1.4),
    grip: z.number().min(0.7).max(1.3),
    mass: z.number().min(0.6).max(1.6),
    armor: z.number().min(0.6).max(1.6),
  }),
  /** Half length and half width of the body, art pixels. */
  body: z.strictObject({
    halfLength: z.number().min(8).max(13),
    halfWidth: z.number().min(4).max(7),
  }),
  /** Wheel centres on one side (+y); mirrored for the other. */
  wheels: z
    .array(z.tuple([z.number(), z.number()]))
    .min(2)
    .max(3),
  /** Where the roof piece sits: x along the car, z its underside. */
  top: z.strictObject({ x: z.number(), z: z.number() }),
});
export type CarManifest = z.infer<typeof CarSchema>;

const ScatterItem = z.strictObject({ prop: id('prop'), weight: z.number().positive() });

export const SceneryRuleSchema = z.discriminatedUnion('rule', [
  /** Props on the outside of every bend sharper than minCurve. */
  z.strictObject({
    rule: z.literal('bend-wall'),
    props: z.array(id('prop')).min(1),
    offset: z.number(),
    minCurve: z.number(),
  }),
  /**
   * A flyover: the road climbs a ramp onto a raised deck at fraction `at` of the way round, runs
   * flat for `length`, and comes down a ramp the other side (each ramp `ramp` long, art px). Cars
   * on the deck ride at `height`; the rest of the track passes under it. The deck is laid in
   * `deck` pieces, `span` of them to a span held up by a pair of `pillar`s (none where a road
   * passes below). A span comes down when its pillars go.
   */
  z.strictObject({
    rule: z.literal('flyover'),
    at: unit,
    length: z.number().positive(),
    ramp: z.number().positive(),
    height: z.number().min(8).max(40),
    deck: id('prop'),
    pillar: id('prop'),
    span: z.number().int().min(1),
  }),
  /**
   * Great trees beside the road whose crowns hang out over it: a `trunk` with `clumps` of
   * `crowns` up in it, from `lift[0]` to `lift[1]` art px high and up to `reach` from the trunk,
   * leaning out over the road. Cars drive under the crowns. The crowns fall with the trunk.
   */
  z.strictObject({
    rule: z.literal('canopy'),
    count: z.number().int().positive(),
    trunk: id('prop'),
    crowns: z.array(id('prop')).min(1),
    clumps: z.tuple([z.number().int().min(1), z.number().int().min(1)]),
    lift: z.tuple([z.number().min(0), z.number().min(0)]),
    reach: z.number().positive(),
    /** How far from the road's edge the trunk stands. */
    edge: z.number(),
  }),
  /** Random props on open ground at least `clear` from the road. */
  z.strictObject({
    rule: z.literal('scatter'),
    perArea: z.number().positive(),
    clear: z.number(),
    items: z.array(ScatterItem).min(1),
  }),
  /** Every `every` samples a group by the road: two `pair` props on the edge, or `stack` and `drum` props just off it. */
  z.strictObject({
    rule: z.literal('roadside'),
    every: z.number().int().positive(),
    pair: id('prop'),
    stack: id('prop'),
    drum: id('prop'),
    /** Bigger things that now and then stand by the road instead of a pair of drums. */
    tanks: z.array(id('prop')).default([]),
  }),
  /** A ring of props round the world's edge (looks only). */
  z.strictObject({ rule: z.literal('border'), prop: id('prop'), spacing: z.number().positive() }),
  /** Props round the derby oval's wall (looks only; the oval is the wall). */
  z.strictObject({
    rule: z.literal('oval-wall'),
    prop: id('prop'),
    spacing: z.number().positive(),
  }),
  /** count props evenly on an ellipse round the centre. */
  z.strictObject({
    rule: z.literal('ring'),
    props: z.array(id('prop')).min(1),
    count: z.number().int().positive(),
    rx: z.number(),
    ry: z.number(),
  }),
  /** Fixed props at offsets from the centre. */
  z.strictObject({
    rule: z.literal('place'),
    items: z.array(
      z.strictObject({ prop: id('prop'), x: z.number(), y: z.number(), rot: z.number() }),
    ),
  }),
  /**
   * Buildings put up piece by piece off the road, so that each piece can be knocked out on its
   * own. A `house` is a rectangle of `wall` pieces with a doorway, `window` pieces here and
   * there, a `post` at each corner and `roof` pieces over the inside; a `yard` is the same with
   * no roof, a wide gateway and `inside` props standing in it; a `wall` is one straight run.
   * Sizes are in pieces, `step` art px apart. When half of a building's walls are down, the
   * rest of it comes down too.
   */
  z.strictObject({
    rule: z.literal('build'),
    count: z.number().int().positive(),
    clear: z.number(),
    /** On a track: stand in a band this wide beside the road, squared up to it, as on a street. */
    along: z.number().positive().optional(),
    kinds: z
      .array(
        z.strictObject({
          shape: z.enum(['house', 'yard', 'wall']),
          weight: z.number().positive(),
          wall: id('prop'),
          window: id('prop').optional(),
          post: id('prop').optional(),
          roof: id('prop').optional(),
          inside: z.array(id('prop')).default([]),
          step: z.number().positive().default(8),
          long: z.tuple([z.number().int().min(2), z.number().int().min(2)]),
          deep: z.tuple([z.number().int().min(2), z.number().int().min(2)]).default([2, 2]),
        }),
      )
      .min(1),
  }),
  /**
   * A barricade right across the road every `every` samples: `prop` pieces `step` apart from
   * edge to edge, with `gap` of them left out somewhere. Meant for pieces a car can ram through.
   */
  z.strictObject({
    rule: z.literal('barricade'),
    every: z.number().int().positive(),
    prop: id('prop'),
    step: z.number().positive().default(8),
    gap: z.number().int().min(0).default(0),
  }),
  /**
   * A stone arch over the road every `every` samples: a `leg` standing on each side, `offset`
   * beyond the kerb, and `span` pieces `step` apart across the road between them (looks that
   * stand high, so cars drive under). Bring down a leg and the whole arch comes down; a span
   * piece that falls drops whatever rubble its manifest says onto the road below.
   */
  z.strictObject({
    rule: z.literal('arch'),
    every: z.number().int().positive(),
    leg: id('prop'),
    span: id('prop'),
    step: z.number().positive().default(9),
    offset: z.number().default(6),
  }),
  /**
   * Patches of a material the ground has from the start (mud, tar, ice): `count` of them, of a
   * radius between the two `r`, on the road, off it, or anywhere.
   */
  z.strictObject({
    rule: z.literal('patches'),
    material: id('material'),
    count: z.number().int().positive(),
    r: z.tuple([z.number().positive(), z.number().positive()]),
    on: z.enum(['road', 'off', 'any']).default('any'),
  }),
  /**
   * A river through the map, upstream end first, `width` art px across, of `material`. Nothing
   * else the rules put up stands in it (list this rule last). Where it crosses the road a bridge
   * goes over it, the `bridges` in turn: a flat `deck` a car drives over and a `rail` along each
   * edge. A deck piece that comes down lets the river through. A `dam` of `wall` pieces holds a
   * lake back `at` art px down the river; once any piece of it is down, a flood runs down the
   * river at `flood.speed`, `flood.width` across, strikes what stands in it with `flood.force`, shoves cars along
   * and leaves the banks `bank` (mud).
   */
  z.strictObject({
    rule: z.literal('river'),
    material: id('material'),
    bank: id('material'),
    width: z.number().positive(),
    points: z.array(z.tuple([z.number(), z.number()])).min(2),
    bridges: z.array(z.strictObject({ deck: id('prop'), rail: id('prop') })).min(1),
    dam: z
      .strictObject({
        wall: id('prop'),
        at: z.number().positive(),
        span: z.number().positive(),
        lake: z.number().min(1).default(3),
      })
      .optional(),
    flood: z
      .strictObject({
        speed: z.number().positive(),
        width: z.number().positive(),
        /** The knock it gives everything standing in its way. */
        force: z.number().positive().default(40),
      })
      .default({ speed: 120, width: 90, force: 40 }),
    /** Props along both banks, about `every` art px apart (rocks, reeds). */
    edge: z
      .strictObject({ every: z.number().positive(), items: z.array(ScatterItem).min(1) })
      .optional(),
  }),
  /**
   * A harbour basin straight across the arena, `y` from the centre and `half` deep each way:
   * deep `material` laid in pools of radius `r`, crossed by wooden `piers` (`deck` pieces with
   * `post` piles down both sides; a broken deck lets the water through), `bollard`s every
   * `spacing` along both quays, `barges` moored in the water between the piers, and gantry
   * `cranes` straddling it on four `leg`s with `beam` pieces overhead. A crane that loses two
   * legs comes down whole.
   */
  z.strictObject({
    rule: z.literal('harbour'),
    material: id('material'),
    y: z.number(),
    half: z.number().positive(),
    r: z.number().positive().default(16),
    piers: z.strictObject({
      deck: id('prop'),
      post: id('prop'),
      at: z.array(z.number()).min(1),
      wide: z.number().positive(),
    }),
    bollard: id('prop').optional(),
    spacing: z.number().positive().default(30),
    barges: z.strictObject({ prop: id('prop'), count: z.number().int().min(0) }).optional(),
    cranes: z
      .strictObject({ leg: id('prop'), beam: id('prop'), at: z.array(z.number()).min(1) })
      .optional(),
  }),
  /**
   * A container yard: `count` blocks of `cols` x `rows` boxes `step` apart, squared to the
   * arena, on dry ground. Every box is a `bottom` piece, and `high` of them carry a `top` piece
   * that falls off whole when it or the box under it is knocked out.
   */
  z.strictObject({
    rule: z.literal('stacks'),
    count: z.number().int().positive(),
    bottom: z.array(id('prop')).min(1),
    top: z.array(id('prop')).min(1),
    high: unit,
    cols: z.tuple([z.number().int().min(1), z.number().int().min(1)]),
    rows: z.tuple([z.number().int().min(1), z.number().int().min(1)]),
    step: z.tuple([z.number().positive(), z.number().positive()]),
    clear: z.number().min(0),
  }),
  /** Random props inside the oval between radii qMin and qMax (fractions of the oval). */
  z.strictObject({
    rule: z.literal('oval-scatter'),
    count: z.number().int().positive(),
    qMin: unit,
    qMax: unit,
    items: z.array(ScatterItem).min(1),
    clear: z.number(),
  }),
  /**
   * Tower blocks beside the road along it: a grid of `column` props `cols` by `rows`, `step` art
   * px apart, leaned towards the road (so a block that comes down falls across it). The first
   * row, nearest the road, is `front` if given, and then it alone holds the block up: when half
   * of it is down the whole block topples. Without a `front` every column holds it up.
   */
  z.strictObject({
    rule: z.literal('towers'),
    count: z.number().int().positive(),
    column: z.array(id('prop')).min(1),
    front: id('prop').optional(),
    cols: z.tuple([z.number().int().min(1), z.number().int().min(1)]),
    rows: z.tuple([z.number().int().min(1), z.number().int().min(1)]),
    step: z.number().positive(),
    clear: z.number(),
    along: z.number().min(0),
  }),
  /**
   * A raised road over the track at each of `at` (fractions of the way round): `pillar` props
   * either side of the road, holding up `deck` props across it, all one structure. Cars pass
   * under the deck; when the pillars go, it comes down on the road.
   */
  z.strictObject({
    rule: z.literal('overpass'),
    at: z.array(unit).min(1),
    pillar: id('prop'),
    deck: id('prop'),
    step: z.number().positive(),
    /** How far past the road's edge the pillars stand. */
    out: z.number().min(0),
    /** Lanes of deck side by side, along the road. */
    width: z.number().int().min(1).default(2),
  }),
  /**
   * Things along both kerbs: every `every` samples, a pick of `items` at `offset` art px past
   * the road's edge, turned to run with the road. Lampposts, parked cars, bins.
   */
  z.strictObject({
    rule: z.literal('kerb'),
    every: z.number().int().positive(),
    offset: z.number(),
    chance: unit.default(1),
    items: z.array(ScatterItem).min(1),
  }),
]);
export type SceneryRule = z.infer<typeof SceneryRuleSchema>;

export const VenueSchema = z.strictObject({
  ...base,
  id: id('venue'),
  mode: id('mode'),
  /** Fixed seed for the venue's scenery, so a venue looks the same every time. */
  seed: z.number().int(),
  size: z.strictObject({
    w: z.number().int().min(400).max(4000),
    h: z.number().int().min(400).max(4000),
  }),
  /** Race venues: the road's centre line through these points (closed Catmull-Rom) and its width. */
  track: z
    .strictObject({
      road: z.number().min(40).max(120),
      points: z.array(z.tuple([z.number(), z.number()])).min(4),
    })
    .optional(),
  /** Derby venues: the walled oval. */
  oval: z
    .strictObject({ cx: z.number(), cy: z.number(), rx: z.number(), ry: z.number() })
    .optional(),
  colors: z.strictObject({ ground: hex, ground2: hex, dirt: hex, outside: hex }),
  scenery: z.array(SceneryRuleSchema),
  bots: z.strictObject({ bot: id('bot'), count: z.number().int().min(0).max(40) }),
  pickups: z.array(id('pickup')).min(1),
});
export type VenueManifest = z.infer<typeof VenueSchema>;

export const ModeSchema = z.strictObject({
  ...base,
  id: id('mode'),
  kind: z.enum(['race', 'derby']),
  /** Damage taken is multiplied by this. */
  damageScale: z.number().positive(),
  /** Race: laps to finish. */
  laps: z.number().int().positive().optional(),
  /** Seconds before a wreck is towed back to the road; absent: a wreck stays out. */
  respawnSeconds: z.number().positive().optional(),
  /** Derby: time limit in seconds. */
  timeLimit: z.number().positive().optional(),
  /** The AI every rival uses. */
  ai: id('ai'),
  /** Seconds a pickup takes to come back. */
  pickupRespawn: z.number().positive(),
  /**
   * Race: a human more than `gap` art px of road behind the car in front is helped along, up to
   * `pace` times its top speed once it is `full` behind (rivals have their own rubber band).
   */
  chase: z
    .strictObject({
      gap: z.number().positive(),
      full: z.number().positive(),
      pace: z.number().min(1),
    })
    .optional(),
});
export type ModeManifest = z.infer<typeof ModeSchema>;

export const WeaponSchema = z.strictObject({
  ...base,
  id: id('weapon'),
  kind: z.enum([
    'rocket',
    'mine',
    'gun',
    'slick',
    'smoke',
    'caltrops',
    'pulse',
    'spray',
    'rail',
    'ball',
    'lob',
    'sticky',
    'arc',
    'vortex',
    'howl',
    'boomerang',
    'skip',
    'tether',
    'barrage',
    'burrow',
    'sentry',
    'swarm',
    'beam',
    'swap',
    'trail',
    'twister',
    'flail',
    'meteor',
    'fissure',
    'frost',
    'pit',
  ]),
  /** Label on the fire button. */
  label: z.string().min(1).max(8),
  ammo: z.number().int().positive(),
  /** Explosion power: 1 is a barrel. */
  power: z.number().positive(),
  cooldown: z.number().positive(),
  /** Rockets: speed added to the car's, seconds of flight, turn rate towards a target ahead. */
  speed: z.number().positive().optional(),
  life: z.number().positive().optional(),
  homing: z.number().min(0).optional(),
  /**
   * Rockets: on launch, lock onto the nearest rival within `range` and `cone` radians of the nose,
   * and chase that car (at the `homing` turn rate) for the whole flight, wherever it goes.
   */
  lock: z.strictObject({ range: z.number().positive(), cone: z.number().positive() }).optional(),
  /**
   * Rockets: when it bursts it throws `count` of the `bomblet` weapon (a rocket) out ahead in a
   * fan `spread` radians wide; it also bursts by itself after `fuse` seconds.
   */
  cluster: z
    .strictObject({
      bomblet: id('weapon'),
      count: z.number().int().positive(),
      spread: z.number().positive(),
      fuse: z.number().positive(),
    })
    .optional(),
  /**
   * Guns: fitted to every car and fired by themselves at a car in the sights. `ammo` is the rounds
   * a car starts with, `damage` what a round does, `range` how far it reaches and `aim` how far
   * off the nose (radians) a target may be.
   */
  damage: z.number().positive().optional(),
  range: z.number().positive().optional(),
  aim: z.number().positive().optional(),
  /** Slicks: a pool of `material` of this `radius` poured out behind the car. */
  material: id('material').optional(),
  radius: z.number().positive().optional(),
  /** Mines: seconds before it arms; trigger radius. Rockets: seconds before contact sets it off. */
  arm: z.number().min(0).optional(),
  trigger: z.number().positive().optional(),
  /**
   * Smoke: a cloud of this `radius` set down behind the car that hangs for `life` seconds. A
   * driver who goes into it cannot see the road for `blind` seconds after, and a gun cannot pick
   * out a car inside it.
   */
  blind: z.number().positive().optional(),
  /**
   * Caltrops: `count` spikes scattered over `radius` behind the car, lying for `life` seconds. A
   * car that rolls over one has a flat for `flat` seconds (slow and wobbly) and takes `damage`.
   */
  count: z.number().int().positive().optional(),
  flat: z.number().positive().optional(),
  /**
   * Pulses: a ring of charge that spreads from the car at `speed` (art px per second) out to
   * `radius`. Every rival it crosses has its engine cut for `stall` seconds and takes `damage`.
   * Where it touches something that conducts it arcs on, up to `chain` hops of `reach` art px
   * each, striking cars and lighting fuel near every conductor it jumps to.
   */
  stall: z.number().positive().optional(),
  chain: z.number().int().min(0).optional(),
  reach: z.number().positive().optional(),
  /**
   * Sprays: one press is a burst `life` seconds long of drops of `material` thrown forward at
   * `speed`, fanned by `spread` (radians), each reaching `range`. `lit` drops are burning fuel:
   * they set alight what they touch and leave fire where they land. Each drop that strikes a car
   * does `damage` and shoves it by `push`; where drops land some leave a little pool behind.
   */
  spread: z.number().min(0).optional(),
  push: z.number().min(0).optional(),
  lit: z.boolean().optional(),
  /**
   * Rails: a slug that crosses `range` at once. It goes through every car on its line for
   * `damage` each, and punches through up to `pierce` pieces of scenery it can knock down.
   */
  pierce: z.number().int().min(0).optional(),
  /**
   * Balls: a heavy ball of `radius` rolled forward at `speed` that rolls for `life` seconds,
   * smashing through what it can and glancing off what it cannot; `damage` per unit of speed.
   * Lobs: a shell thrown over everything onto a car ahead (or `range` ahead) that bursts into a
   * blast of `power` and `count` pools of `material`, lit. Stickies: a dart that clings to the
   * first car it strikes and blows `fuse` seconds later, unless that car hands it on by touching
   * another car first.
   */
  fuse: z.number().positive().optional(),
  /**
   * Arcs: one press crackles for `life` seconds, each strike jumping from the car to a rival in
   * front within `range`, then on through up to `count` cars in all, `damage` less a quarter each
   * jump. Vortexes: an orb thrown out at `speed` that anchors and pulls everything within `radius`
   * in with strength `push` for `life` seconds, then bursts with `power`. (`count` is declared
   * with caltrops above.)
   */
  /**
   * Howls: a shockwave that leaves no crater. A front runs out from where the car stood at `speed`
   * to `radius`, and whatever it crosses is hurled outward: cars at up to `push` (art px per
   * second) and thrown `lift` into the air, taking `damage`; loose props, rockets, shells, balls
   * and everything else in flight are turned round and sent away, and mines, spikes and smoke are
   * swept along with the front. `power` is how hard it leans on scenery.
   */
  lift: z.number().min(0).optional(),
  /**
   * Ten more kinds (sim `arsenal.ts`), all on the fields above. Boomerangs: a stick of `radius`
   * thrown at `speed` that turns for home `range` out (at `homing` rad/s) and cuts for `damage`.
   * Skips: a bomb that bounces `count` times, `fuse` seconds apart, a blast of `power` each time.
   * Tethers: a hook thrown `range` at `speed`; the car it bites is tied to the thrower for `life`
   * seconds by a line with `reach` of slack that hauls with strength `push`. Barrages: `count`
   * shells in a row within `range`, the first landing after `arm` seconds and the rest `fuse`
   * apart, each `spread` off the line. Burrows: a digger at `speed` for `life` seconds that turns
   * after cars within `range` (`homing`), comes up within `trigger` of one once `arm` has passed
   * and throws it up at `lift`. Sentries: a turret that stands `life` seconds with `count` rounds,
   * one every `fuse` seconds at cars within `range` for `damage`, turning at `homing`; run over,
   * it blows with `power`. Swarms: `count` fleas that hop at `speed` after cars within `range` for
   * `fuse` seconds, then ride one for `life` seconds, each biting `damage` a second. Beams: a ray
   * `range` long held for `life` seconds that burns a car for `damage` a second and scenery by
   * `power`. Swaps: a bolt at `speed` over `range` that bends (`homing`) towards a car within `aim`
   * of its path and changes places with it. Trails: for `life` seconds the car leaves a fire of
   * `radius` every `reach` it travels, each burning `fuse` seconds.
   *
   * Five more (sim `wild.ts`). Twisters: a whirlwind of `radius` that wanders at `speed` for `life`
   * seconds, leaning (`homing`) towards cars within `range`; what it reaches is dragged round and
   * in with strength `push`, thrown up at `lift` and takes `damage` twice a second. Flails: for
   * `life` seconds a ball of `radius` swings round the car on `reach` of chain at `speed` rad/s,
   * striking for `damage` and knocking cars on by `push`. Meteors: one blast of `power` that
   * lands `arm` seconds after it is called, its mark following the leading car until `fuse`
   * seconds before, with `count` small pits round it; a car right under it takes `damage` more. Fissures: a crack that runs `range` at
   * `speed`, opening a pit of `power` every `reach`; cars within `radius` are thrown up at `lift`
   * for `damage`. Frosts: engines within `radius` die for `stall` seconds and take `damage`, fires
   * there go out, and `count` pools of `material` are left behind the car. Pits: a hole of
   * `radius` dug behind the car that lasts `life` seconds; a car that drives in is down it for
   * `stall` seconds and takes `damage` in a race, and is out for good in a derby. AI drivers dig one for a car within
   * `range` behind them.
   */
});
export type WeaponManifest = z.infer<typeof WeaponSchema>;

/**
 * Guards: countermeasures a car carries that act by themselves when the thing they guard against
 * turns up. Each is a pickup kind.
 *
 * - decoy   thrown out when a rocket comes for the car; rockets chase it instead and burst on it
 * - flak    shoots rockets, shells and darts out of the air within `reach`
 * - mirror  gun rounds, rail slugs and sticky darts go back the way they came
 * - bond    `amount` of every blow runs down a leash of sparks to the nearest rival within `reach`
 * - sweep   feelers that set mines off early and flick spikes aside, `reach` ahead
 * - earth   a trailing lead that takes shocks and lightning to ground
 * - anchor  claws that hold the car where a blast, a shockwave or a pull would throw it
 * - soak    a wet coat: fire does not burn it, and fire within `reach` is put out
 * - jam     guns, seeker rockets and lobbed shells cannot pick the car out
 * - pads    what the car drives into, or what falls on it, costs no armour
 */
export const GUARD_KINDS = [
  'decoy',
  'flak',
  'mirror',
  'bond',
  'sweep',
  'earth',
  'anchor',
  'soak',
  'jam',
  'pads',
] as const;
export type GuardKind = (typeof GUARD_KINDS)[number];

export const PickupSchema = z.strictObject({
  ...base,
  id: id('pickup'),
  kind: z.enum([
    'repair',
    'nitro',
    'arms',
    'ammo',
    'cash',
    'shield',
    'weld',
    'blade',
    'springs',
    'kit',
    ...GUARD_KINDS,
    'grow',
    'shrink',
    'wind',
    'collar',
    'bones',
  ]),
  /** Relative chance; `hurt` is used instead when the car is below 70 armour. */
  weight: z.number().positive(),
  hurtWeight: z.number().positive(),
  /**
   * Catch-up: in a race the chance is multiplied by `lead` for the car in front and by `trail`
   * for the car at the back, and by something in between for the cars between them (both 1 when
   * absent). A derby has no front or back: every car gets the midpoint.
   */
  lead: z.number().min(0).optional(),
  trail: z.number().min(0).optional(),
  /**
   * Catch-up items (sim/catchup.ts), all lasting `seconds`. Grow: the car swells to `scale` times
   * its size, and `pace` multiplies its top speed. Shrink: every rival ahead (or, with nobody
   * ahead, within `radius`) is zapped down to `scale`, at `pace`. Wind: top speed times `pace`.
   * Collar: the car in front is weighed down to `pace`. Bones: `charges` of `prop` drop out of
   * the sky in front of each rival ahead (or within `radius`).
   */
  scale: z.number().positive().optional(),
  pace: z.number().positive().optional(),
  radius: z.number().positive().optional(),
  prop: id('prop').optional(),
  /** Repair: armour restored. Ammo: rounds for the gun. Cash: money. */
  amount: z.number().positive().optional(),
  /** Arms: weapons to pick from. */
  weapons: z.array(id('weapon')).min(1).optional(),
  /**
   * Shield: how long the bubble lasts before it fades (it pops sooner once `amount` of damage has
   * landed on it). Weld: how long the welding takes to put `amount` armour back. Blade: seconds it
   * stays bolted on; `bite` is the armour it chews off what it ploughs, per second.
   */
  seconds: z.number().positive().optional(),
  bite: z.number().positive().optional(),
  /** Springs: leaps it holds, and how hard each one throws the car up (art px/s). */
  charges: z.number().int().positive().optional(),
  lift: z.number().positive().optional(),
  /** Kit: a crate that holds one of these pickups, picked at random. */
  kits: z.array(id('pickup')).min(1).optional(),
  /**
   * Guards (see GUARD_KINDS, and guards.ts in the sim): `charges` uses or `seconds` on the car,
   * and how far it reaches (art px). A bond's `amount` is the share of each blow it passes on.
   */
  reach: z.number().positive().optional(),
});
export type PickupManifest = z.infer<typeof PickupSchema>;

export const PropSchema = z.strictObject({
  ...base,
  id: id('prop'),
  /** static: never moves, cars bounce off. loose: pushed around, can fly. */
  body: z.enum(['static', 'loose']),
  radius: z.number().positive(),
  /** Static props: false for looks-only props (fences, the oval wall). */
  solid: z.boolean().default(true),
  mass: z.number().positive().optional(),
  /** Damage a car takes hitting it is scaled by this (tyres are soft). */
  hardness: z.number().min(0).default(1),
  /**
   * Static props: what it is made of and how much it takes before it comes down. Without
   * `integrity` it cannot be broken.
   */
  made: id('material').optional(),
  integrity: z.number().positive().optional(),
  /**
   * Static props: a crown of leaves. Everything outside the bare trunk (a cylinder of radius
   * `trunk` up to height `top`, art px) is leaf. A blast's pressure tears leaves off well beyond
   * its crater, less the higher `hold` is; `flash` is the chance the heat of one close by sets the
   * crown alight.
   */
  crown: z
    .strictObject({
      trunk: z.number().min(0),
      top: z.number().min(0),
      hold: z.number().min(0).max(1).default(0.3),
      flash: z.number().min(0).max(1).default(0.15),
    })
    .optional(),
  /**
   * Static props that can be broken: seconds after it comes down that it is built again where it
   * stood (a flyover span, so a race is never cut in two for good). The last `REBUILD_TIME` of
   * that it is flying back together.
   */
  rebuild: z.number().positive().optional(),
  /** Sways in the wind (trees). */
  sway: z.boolean().default(false),
  /** Loose props: breaks into planks above this impact speed. */
  breaksAt: z.number().positive().optional(),
  /** Loose props: explodes above this impact speed, or when caught in a blast. */
  explodesAt: z.number().positive().optional(),
  blast: z.number().positive().optional(),
  /**
   * A drum of fuel under pressure: when it is broken open it bursts where it stands and shoots
   * `up` (art px per second) into the air, then blows apart there with power `burst`, throwing
   * out `stars` (burning sparks that pop where they land) and `globs` of burning fuel (each
   * lands as a pool of fire).
   */
  rocket: z
    .strictObject({
      up: z.number().positive(),
      burst: z.number().positive(),
      stars: z.number().int().min(0),
      globs: z.number().int().min(0),
    })
    .optional(),
  /**
   * Holds a liquid: when it is broken, or its fuse is lit, `n` pools of `material` of about
   * radius `r` pour out round it.
   */
  spills: z
    .strictObject({
      material: id('material'),
      r: z.number().positive(),
      n: z.number().int().min(1),
    })
    .optional(),
  /**
   * What an exploding prop throws out besides its blast: burning stars, globs of burning fuel,
   * and `drums` flying props of kind `drum` (which must be able to rocket).
   */
  throws: z
    .strictObject({
      stars: z.number().int().min(0).default(0),
      globs: z.number().int().min(0).default(0),
      drums: z.number().int().min(0).default(0),
      drum: id('prop').optional(),
    })
    .optional(),
  /**
   * Static props: what is left when it comes down. Up to `n` pieces of `prop` (a static), each
   * with this `chance`, land within `spread` of a point `reach` art px from it towards the road:
   * a cliff that crumbles drops a rockfall into the lane beside it.
   */
  rubble: z
    .strictObject({
      prop: id('prop'),
      n: z.number().int().min(1).max(6),
      chance: unit.default(1),
      reach: z.number().min(0).default(0),
      spread: z.number().min(0).default(4),
    })
    .optional(),
  /**
   * Static props: a stack of something heavy. When it comes down, `n` loose props of kind `prop`
   * drop from as high as `height` (art px) and tumble out away from what knocked it, at up to
   * `spread` art px per second.
   */
  topple: z
    .strictObject({
      prop: id('prop'),
      n: z.number().int().min(1).max(8),
      height: z.number().positive(),
      spread: z.number().min(0),
    })
    .optional(),
  /**
   * Loose props: so heavy that landing on something hurts it. A car it comes down on takes this
   * much damage per 100 art px per second of fall, and scenery under it takes twice that.
   */
  crush: z.number().positive().optional(),
  /**
   * Static props: a press over a bed that cars can drive across. Every `period` seconds it slams
   * down and stays down `shut` seconds, then rises again to `lift` art px. Everything within
   * `reach` of the middle when it lands takes `hurt`. `plate` is the prop drawn as the moving
   * ram (it is never placed itself), and `warn` the seconds it shudders before it drops.
   */
  press: z
    .strictObject({
      period: z.number().positive(),
      shut: z.number().positive(),
      rise: z.number().positive().default(1),
      warn: z.number().min(0).default(0.6),
      lift: z.number().positive(),
      reach: z.number().positive(),
      hurt: z.number().positive(),
      plate: id('prop'),
    })
    .optional(),
  /**
   * Static props standing on something: when it comes down it does not break up but falls off
   * whole, as the loose prop `into`, from height `z` (art px), tipping away from what hit it.
   */
  topples: z.strictObject({ into: id('prop'), z: z.number().min(0) }).optional(),
  /**
   * Loose props: damage done to a car it lands on from a height (a falling container), whatever
   * the speed. (`crush` above scales with the speed of the fall instead.)
   */
  smash: z.number().positive().optional(),
  /** Loose props: how much of an impact sends it up in the air. */
  launch: z.number().min(0).default(0.25),
  /** Points for the car that breaks it. */
  points: z.number().int().min(0).default(0),
  /**
   * Static props: its height is this many floors. As it takes damage it loses them from the top,
   * one at a time, and the client draws only the floors it has left.
   */
  storeys: z.number().int().min(2).max(24).optional(),
  /**
   * Static props: when it is brought down with floors still standing it falls over, the way the
   * rule that put it up leans it (or where it stands), and lays `rubble` props along where it
   * lands, `step` art px apart, as far as it was tall times `spread`. Cars it lands on are hurt.
   * (Not `topple`, which is a stack that sheds loose props.)
   */
  fallOver: z
    .strictObject({
      rubble: id('prop'),
      /** How tall one floor is, art px. */
      floor: z.number().positive().default(4),
      step: z.number().positive().default(7),
      spread: z.number().positive().default(1),
      crush: z.number().min(0).default(30),
    })
    .optional(),
});
export type PropManifest = z.infer<typeof PropSchema>;

export const BotSchema = z.strictObject({
  ...base,
  id: id('bot'),
  walkSpeed: z.number().positive(),
  fleeSpeed: z.number().positive(),
  /** Flees cars faster than fleeAbove within this distance. */
  scareRadius: z.number().positive(),
  fleeAbove: z.number().positive(),
  /** A car faster than this flattens it. */
  smashAbove: z.number().positive(),
  points: z.number().int().min(0),
  nitro: unit,
  respawn: z.tuple([z.number().positive(), z.number().positive()]),
  paints: z.array(hex).min(1),
});
export type BotManifest = z.infer<typeof BotSchema>;

export const AiSchema = z.strictObject({
  ...base,
  id: id('ai'),
  behaviour: id('ai'),
  /** Each rival rolls a skill and an aggression in these ranges. */
  skill: z.tuple([unit, unit]),
  aggro: z.tuple([unit, unit]),
});
export type AiManifest = z.infer<typeof AiSchema>;

/**
 * Something that lies on the ground in pools: oil, fuel, water. A pool changes how a car drives
 * through it, and may catch fire or put fire out.
 */
export const MaterialSchema = z.strictObject({
  ...base,
  id: id('material'),
  /** How much of its sideways grip a car keeps on it (1: all of it). */
  grip: z.number().min(0).max(1).default(1),
  /** Speed a car loses each second in it, as a share of its speed. */
  drag: z.number().min(0).default(0),
  /** Catches fire from any blast, spark or flame that touches it, and burns this many seconds. */
  burns: z.number().positive().optional(),
  /** Puts out fire it touches, and fire cannot start on it. */
  quenches: z.boolean().default(false),
  /**
   * Carries a shock: a pulse that touches scenery made of it, or a pool of it, arcs on from
   * there (steel, water).
   */
  conducts: z.boolean().default(false),
  /** A wrecked car leaks a pool of this, of this radius. */
  wreck: z.number().positive().optional(),
  /**
   * As something scenery is made of: how well it stands a blast, a ram and fire. 1 is ordinary;
   * glass is far below it, steel far above.
   */
  strength: z
    .strictObject({
      blast: z.number().positive().default(1),
      impact: z.number().positive().default(1),
      heat: z.number().positive().default(1),
    })
    .default({ blast: 1, impact: 1, heat: 1 }),
  /**
   * As something scenery is made of: how it comes apart when it falls. The client's rubble reads
   * this; nothing in the race depends on it.
   */
  breaks: z
    .strictObject({
      /** About how big the pieces it cracks into are, art px. */
      piece: z.number().min(2).max(30).default(7),
      /** How wide the cracks are, art px: what was in them goes as grit. */
      grit: z.number().min(0).max(3).default(0.45),
      /** How much of its speed a piece keeps when it lands (0 dead, 0.9 rubber). */
      bounce: z.number().min(0).max(0.9).default(0.22),
      /** The chance a piece that lands hard splits again. */
      brittle: z.number().min(0).max(1).default(0.6),
      /** How much dust it throws up: 0 none, 1 ordinary. */
      dust: z.number().min(0).max(3).default(1),
      /** How much the wind carries its grit while it is in the air: 0 not at all, 1 like a leaf. */
      drift: z.number().min(0).max(1).default(0),
      /** It strikes sparks where it lands. */
      sparks: z.boolean().default(false),
    })
    .default({
      piece: 7,
      grit: 0.45,
      bounce: 0.22,
      brittle: 0.6,
      dust: 1,
      drift: 0,
      sparks: false,
    }),
  /** How the client paints it on the ground. */
  colour: z.string().regex(/^#[0-9a-f]{6}$/),
  alpha: z.number().min(0).max(1).default(0.7),
});
export type MaterialManifest = z.infer<typeof MaterialSchema>;

export const PackSchema = z.strictObject({
  name: z.string(),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  description: z.string(),
});
export type PackManifest = z.infer<typeof PackSchema>;

export const SCHEMAS = {
  car: CarSchema,
  venue: VenueSchema,
  mode: ModeSchema,
  weapon: WeaponSchema,
  pickup: PickupSchema,
  prop: PropSchema,
  material: MaterialSchema,
  bot: BotSchema,
  ai: AiSchema,
} as const;
export type ContentType = keyof typeof SCHEMAS;
export const CONTENT_TYPES = Object.keys(SCHEMAS) as ContentType[];

export interface ManifestByType {
  car: CarManifest;
  venue: VenueManifest;
  mode: ModeManifest;
  weapon: WeaponManifest;
  pickup: PickupManifest;
  prop: PropManifest;
  material: MaterialManifest;
  bot: BotManifest;
  ai: AiManifest;
}
