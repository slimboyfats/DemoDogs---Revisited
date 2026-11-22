import type {
  BotManifest,
  CarManifest,
  MaterialManifest,
  PropManifest,
  WeaponManifest,
} from '@demodogs/shared';
import type { AiBehaviour } from './behaviours';

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
  isPlayer: boolean;
  ai: AiState | null;
  x: number;
  y: number;
  z: number;
  vz: number;
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
  nitro: number;
  hp: number;
  /** Health it started the race with. */
  hp0: number;
  /** Body lean across (roll) and along (lurch) the car, for the stack's slices. */
  roll: number;
  lurch: number;
  bounce: number;
  wheelDist: number;
  wrecked: boolean;
  wreckT: number;
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
  aiSpeed: number;
  smokeT: number;
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
  /** The building it is a piece of, and whether it helps hold that building up. */
  group?: number;
  bears?: boolean;
  x: number;
  y: number;
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
  h: number;
  v: number;
  owner: number;
  life: number;
  def: WeaponManifest;
}

export interface Mine {
  x: number;
  y: number;
  owner: number;
  t: number;
  def: WeaponManifest;
}

export interface Pickup {
  x: number;
  y: number;
  on: boolean;
  t: number;
}
