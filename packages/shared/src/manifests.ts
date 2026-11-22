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
  /** Random props inside the oval between radii qMin and qMax (fractions of the oval). */
  z.strictObject({
    rule: z.literal('oval-scatter'),
    count: z.number().int().positive(),
    qMin: unit,
    qMax: unit,
    items: z.array(ScatterItem).min(1),
    clear: z.number(),
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
});
export type ModeManifest = z.infer<typeof ModeSchema>;

export const WeaponSchema = z.strictObject({
  ...base,
  id: id('weapon'),
  kind: z.enum(['rocket', 'mine', 'gun']),
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
   * Guns: fitted to every car and fired by themselves at a car in the sights. `ammo` is the rounds
   * a car starts with, `damage` what a round does, `range` how far it reaches and `aim` how far
   * off the nose (radians) a target may be.
   */
  damage: z.number().positive().optional(),
  range: z.number().positive().optional(),
  aim: z.number().positive().optional(),
  /** Mines: seconds before it arms; trigger radius. */
  arm: z.number().min(0).optional(),
  trigger: z.number().positive().optional(),
});
export type WeaponManifest = z.infer<typeof WeaponSchema>;

export const PickupSchema = z.strictObject({
  ...base,
  id: id('pickup'),
  kind: z.enum(['repair', 'nitro', 'arms', 'ammo', 'cash']),
  /** Relative chance; `hurt` is used instead when the car is below 70 armour. */
  weight: z.number().positive(),
  hurtWeight: z.number().positive(),
  /** Repair: armour restored. Ammo: rounds for the gun. Cash: money. */
  amount: z.number().positive().optional(),
  /** Arms: weapons to pick from. */
  weapons: z.array(id('weapon')).min(1).optional(),
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
  /** Sways in the wind (trees). */
  sway: z.boolean().default(false),
  /** Loose props: breaks into planks above this impact speed. */
  breaksAt: z.number().positive().optional(),
  /** Loose props: explodes above this impact speed, or when caught in a blast. */
  explodesAt: z.number().positive().optional(),
  blast: z.number().positive().optional(),
  /** Loose props: how much of an impact sends it up in the air. */
  launch: z.number().min(0).default(0.25),
  /** Points for the car that breaks it. */
  points: z.number().int().min(0).default(0),
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
  bot: BotManifest;
  ai: AiManifest;
}
