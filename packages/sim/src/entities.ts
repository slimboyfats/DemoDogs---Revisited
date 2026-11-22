import type { BotManifest, CarManifest, PropManifest, WeaponManifest } from '@demodogs/shared';
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

export interface Car {
  index: number;
  def: CarManifest;
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
  invuln: number;
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
  def: PropManifest;
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
