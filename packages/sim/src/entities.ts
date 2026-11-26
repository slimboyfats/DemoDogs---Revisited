import type {
  BotManifest,
  CarManifest,
  MaterialManifest,
  PickupManifest,
  PropManifest,
  WeaponManifest,
} from '@demodogs/shared';
import type { Fit } from './addons';
import type { AiBehaviour } from './behaviours';
import type { Guards } from './guards';
import type { Tricks } from './tricks';

/** What a rival's AI remembers between ticks. */
export interface AiState {
  behaviour: AiBehaviour;
  /** Preferred lane across the road, -1 to 1. */
  lane: number;
  /** A per-car phase so rivals don't weave in step. */
  phase: number;
  skill: number;
  aggro: number;
  stuckT: number;
  revT: number;
  boostT: number;
  /** A car index being chased, or -1. */
  target: number;
  targetT: number;
  /** The kind of driver it is (the AI manifest's `styles`), and what that makes of it. */
  style: string;
  traits: Traits;
  /** How far off its line it has moved to get round something, art px across the road. */
  side: number;
  /** Where it last decided to move to, and how far off the first thing in its way was. */
  want: number;
  block: number;
  /** Seconds it has held the weapon it has, and seconds it has wanted to fire it. */
  heldT: number;
  aimT: number;
  /** Times in a row it has had to back out of something, and seconds since the last. */
  tries: number;
  freeT: number;
  /** Seconds it has been backing without getting anywhere. */
  jamT: number;
}

/** What kind of driver an AI is, each 0 to 1 (see `DriverStyleSchema`). */
export interface Traits {
  nerve: number;
  greed: number;
  block: number;
  trigger: number;
  wobble: number;
}

/** Upgrade levels, 0 (stock) to TUNE_MAX. */
export interface Tune {
  engine: number;
  tyres: number;
  armor: number;
}

/** How a car comes to the grid: its upgrades and whatever was bolted on or done to it. */
export interface Setup {
  tune?: Partial<Tune>;
  /** Health at the start, 1 to 100 (a car that was not repaired, or was tampered with). */
  hp?: number;
  /** Multiplier on the damage this car deals by ramming (ram spikes). */
  ram?: number;
  /** Multiplier on what nitro adds to its top speed (hot fuel). */
  fuel?: number;
  /** A weapon already loaded at the start. */
  weapon?: { id: string; ammo: number };
  /** Rounds for the gun at the start, instead of the gun's own load. */
  rounds?: number;
  /** Add-ons (pickup ids) already bolted on at the start. */
  fit?: string[];
  /** A fixed driving skill for an AI driver, instead of one drawn from the AI's range. */
  skill?: number;
}

/** A rival on the entry list. */
export interface Entrant extends Setup {
  car: string;
  name: string;
  paint: string;
}

export interface Car {
  index: number;
  def: CarManifest;
  /** The car type's stats with this car's upgrades applied. */
  stats: CarManifest['stats'];
  ram: number;
  fuel: number;
  name: string;
  paint: string;
  /** Driven by a human (the player, or another driver in online play). */
  isPlayer: boolean;
  /** Which human seat drives it (0 = the player), or -1 for a rival. */
  seat: number;
  ai: AiState | null;
  x: number;
  y: number;
  z: number;
  vz: number;
  /**
   * Height of the road under the car: 0 on the ground, more on a raised deck (a flyover). The car
   * rests on it, and things on another level pass over or under it.
   */
  deck: number;
  /** Heading, radians. */
  h: number;
  vx: number;
  vy: number;
  /** Speed along the heading. */
  vf: number;
  spin: number;
  steer: number;
  throttle: number;
  boosting: boolean;
  handbrake: boolean;
  /** Sliding sideways this tick (skid marks). */
  sliding: boolean;
  offroad: boolean;
  /** What is holding it back this tick: a set of `HELD` bits (shared/constants.ts), for the HUD. */
  held: number;
  nitro: number;
  hp: number;
  /** Health it started the race with. */
  hp0: number;
  /** Body lean across (roll) and along (lurch) the car, for the stack's slices. */
  roll: number;
  lurch: number;
  /**
   * How the car lies on the ground under its wheels (see mounds.ts): nose up (`pitch`) and right
   * side up (`bank`), as height gained per art px, each with the speed it is swinging at. `climb`
   * is how fast the ground under it was rising a tick ago, and `hole` the pothole it is in.
   */
  pitch: number;
  pitchV: number;
  bank: number;
  bankV: number;
  climb: number;
  hole: number;
  bounce: number;
  wheelDist: number;
  /** How far loose boards have wagged its heading from where it would point (rad). */
  sway: number;
  wrecked: boolean;
  wreckT: number;
  /** How long the car has been off the course in a race (s), and the last road it was on: sample and lap. */
  downT: number;
  onIdx: number;
  onLap: number;
  /** Seconds it has lain in the pool under a jump it fell short of (see rescue.ts), 0 when not. */
  plunge: number;
  /** Tick the car was wrecked, for derby placings. */
  wreckTick: number;
  idx: number;
  lap: number;
  progress: number;
  finished: boolean;
  finishTime: number;
  wrongT: number;
  score: number;
  wrecks: number;
  smashed: number;
  weapon: WeaponManifest | null;
  ammo: number;
  /** The gun every car carries, the rounds left in it, and seconds until it can fire again. */
  gun: WeaponManifest | null;
  rounds: number;
  gunCd: number;
  /** Its wheels are in a crater. */
  pit: boolean;
  /** Money picked up off the track this race. */
  cash: number;
  invuln: number;
  /** Shield bubble: armour points it can still soak up, what it started with, seconds left. */
  shield: number;
  shieldMax: number;
  shieldT: number;
  /** Field welder at work: armour put back per second, seconds left. */
  weldRate: number;
  weldT: number;
  fireCd: number;
  hitCd: number;
  scrapeCd: number;
  has: { front: boolean; rear: boolean; top: boolean };
  /**
   * Its lamps that are smashed, a bit each (see `LAMP`): a blow breaks the lamp at the corner
   * it lands on, and a bumper torn off takes both of its end's with it.
   */
  lamps: number;
  aiSpeed: number;
  smokeT: number;
  /** Seconds left on a flat tyre (spikes). */
  flat?: number;
  /** Seconds an AI driver still cannot see the road (smoke). */
  blind?: number;
  /** Seconds its engine stays dead after a shock; absent or 0 when it runs. */
  stall?: number;
  /** In water too deep to wade: seconds it has been going under (see rescue.ts); else 0 or absent. */
  drown?: number;
  /** Down a pit: seconds until it is thrown back out, and how long it went down for. */
  sunk?: number;
  sunkFrom?: number;
  /** Which way it tipped in, in its own frame: [nose first, right side first], length 1. */
  sunkTip?: [number, number];
  /** How fast it turns as it drops, rad/s. */
  sunkTurn?: number;
  /** Wrecked by going down a pit that closed over it: there is no hulk left to see or hit. */
  buried?: boolean;
  /** A blade bolted to the nose (see movers.ts): seconds left, and seconds until its next bite. */
  blade: { def: PickupManifest; t: number; cd: number } | null;
  /** Springs under the car: leaps left. `hop` is seconds into a sprung leap, -1 when not in one. */
  springs: { def: PickupManifest; n: number } | null;
  hop: number;
  /**
   * Track tiles (see pads.ts): seconds a boost tile's surge still lasts and how much it lifts the
   * top speed, and the tile the car is on now (its place in world.statics), -1 if none.
   */
  surge: number;
  surgeK: number;
  pad: number;
  /** Countermeasures on the car, by kind (see guards.ts). */
  guards: Guards;
  /**
   * Catch-up items (see catchup.ts). `size` is how big the car is, 1 its own size: its hull, its
   * weight and how it is drawn all follow it. `pace` multiplies its top speed. `squashT` is the
   * seconds it still lies flattened under a much bigger car.
   */
  size: number;
  pace: number;
  squashT: number;
  /**
   * Seconds left of finding its feet after a tow or being put back on the road: it cannot be hurt
   * and is slow, less so as they run out.
   */
  fresh: number;
  /** A swell (grow) or a zap (shrink) at work on it, a second wind, and a lead collar from car `by`. */
  morph: { def: PickupManifest; t: number } | null;
  wind: { def: PickupManifest; t: number } | null;
  collar: { def: PickupManifest; t: number; by: number } | null;
  /** Add-ons bolted on (see addons.ts), by kind. */
  fit: Fit;
  /** In a rival's wake with a scoop to feed on it, this tick. */
  draft: boolean;
  /** Tricks at work on the car, its own or a rival's doing, by kind (see tricks.ts). */
  tricks: Tricks;
}

export interface Bot {
  index: number;
  def: BotManifest;
  paint: string;
  x: number;
  y: number;
  h: number;
  tx: number;
  ty: number;
  speed: number;
  alive: boolean;
  deadT: number;
}

/** Scenery that never moves. */
export interface StaticProp {
  /** A tree: how much of its crown of leaves it still has, 1 to 0. */
  leaves?: number;
  /** Its place in world.statics. */
  index: number;
  def: PropManifest;
  /** What it is made of, and what it can still take; undefined if it cannot be broken. */
  made: MaterialManifest | null;
  hp?: number;
  /** It has come down: it is no longer in the way and no longer drawn. */
  down?: boolean;
  /** A gate (see gates.ts): seconds it stays down for a switch that was pressed. */
  openT?: number;
  /** Down, and to be built again (def.rebuild): seconds until it stands, and if it is on its way. */
  mendT?: number;
  mending?: boolean;
  /** The building it is a piece of, and whether it helps hold that building up. */
  group?: number;
  bears?: boolean;
  /**
   * A raised road (see spans.ts): the beam it is part of, and its place along it (`link`) if it
   * is deck, or the place it holds up (`holds`) if it is a leg. `rests`: deck lying on the ground.
   */
  beam?: number;
  link?: number;
  holds?: number;
  rests?: boolean;
  /** Deck with nothing under it: seconds until it comes down, and how long it has been sinking. */
  sagT?: number;
  sag?: number;
  /** A building with floors: how many it has left standing. */
  storeys?: number;
  /** Which way it falls over when it comes down (radians), if the rule that built it says. */
  lean?: number;
  x: number;
  y: number;
  /** Height its foot stands at, art px: a deck span or a crown up in a tree. Absent: on the ground. */
  lift?: number;
  rot: number;
  /** Per-prop phase for swaying. */
  seed: number;
}

/** Props cars can shove, launch, break or blow up. */
export interface LooseProp {
  index: number;
  def: PropManifest;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rot: number;
  spin: number;
  alive: boolean;
  /** Seconds until it explodes, once lit; 0 when not lit. */
  fuse: number;
  owner: number;
  /** It has poured out what it held. */
  leaked?: boolean;
  /** A burst fuel drum on its way up; it blows apart at the top of its climb. */
  flying?: boolean;
  /** A falling heavy prop that has already come down on something (see `smash` in docks.ts). */
  crushed?: boolean;
  /**
   * Where it lay when a tick last left it exactly as it was, and what `World.stood` was then.
   * While it still lies there, at rest, with no new scenery stood, a tick has nothing to do to
   * it (see `updateProps`). No part of a race's result: only what lets most props be passed by.
   */
  restX?: number;
  restY?: number;
  restN?: number;
}

/** A burning bit thrown out of a burst: a star (pops where it lands) or a glob of fuel. */
export interface Ember {
  kind: 'star' | 'glob';
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  owner: number;
}

/** A pit a blast dug in the ground. Cars lose speed and grip crossing it. */
export interface Crater {
  x: number;
  y: number;
  r: number;
}

/** A pool of a material lying on the ground. */
export interface Spill {
  /** Part of the map: it was there from the start and is never cleared away to make room. */
  fixed?: boolean;
  def: MaterialManifest;
  x: number;
  y: number;
  r: number;
  owner: number;
}

/** A pool of fire on the ground: it burns cars that stand in it and sets off fuel drums. */
export interface Blaze {
  x: number;
  y: number;
  r: number;
  /** Seconds left, and seconds until it next burns what is in it. */
  t: number;
  bite: number;
  owner: number;
}

export interface Rocket {
  x: number;
  y: number;
  /** The level it flies at: the deck height it was fired from. */
  z: number;
  h: number;
  v: number;
  owner: number;
  life: number;
  def: WeaponManifest;
  /** The car it has locked onto (see `WeaponManifest.lock`), if any. */
  target?: number;
  /** Seconds in the air. */
  age?: number;
  /** The decoy it is chasing instead (see guards.ts), by the decoy's id. */
  lure?: number;
  /** The track sample it is over, while it follows the road round to its target (`lock.road`). */
  idx?: number;
}

/** A hunting rocket on its way up the road to the car in front (see hunt.ts). */
export interface Hunter {
  x: number;
  y: number;
  /** How high it flies: over everything until it comes down. */
  z: number;
  h: number;
  v: number;
  owner: number;
  def: PickupManifest;
  /** The track sample it is over. */
  idx: number;
  age: number;
  /** The car it is coming down on, -1 while it is still on its way. */
  dive: number;
}

export interface Mine {
  x: number;
  y: number;
  /** The level it lies on. */
  z: number;
  owner: number;
  t: number;
  def: WeaponManifest;
}

export interface Pickup {
  x: number;
  y: number;
  /** The level it floats over. */
  z: number;
  on: boolean;
  t: number;
  /** A secret way's crate (a prop with `gives`): what it holds, every one, instead of a roll. */
  gives?: readonly string[];
}

/** The bits of `Car.lamps`: head lamps left and right, tail lamps left and right. */
export const LAMP = { headLeft: 1, headRight: 2, tailLeft: 4, tailRight: 8 } as const;
