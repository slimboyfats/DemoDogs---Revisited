import { DT } from '@demodogs/shared';
import { World, type Content, type Entrant, type Setup } from '@demodogs/sim';
import type { Sound } from '../audio/sound';
import type { Input } from '../input/input';
import type { Art } from '../render/art';
import { Effects } from '../render/effects';
import { makeGround, type Ground } from '../render/ground';
import type { Camera } from '../render/scene';

export interface SessionOptions {
  content: Content;
  art: Art;
  sound: Sound;
  input: Input;
  venue: string;
  car: string;
  seed: number;
  autopilot: boolean;
  /** A career race: the named rivals, the player's car as it stands, and no tow truck. */
  field?: Entrant[];
  player?: Setup;
  knockout?: boolean;
}

/** At most this many sim ticks per frame, so a slow frame does not snowball. */
const MAX_STEPS = 5;

/**
 * One race or derby: the sim world, the client's effects and ground, and the camera. The world
 * steps at a fixed 60 Hz however fast the screen refreshes.
 */
export class Session {
  readonly world: World;
  readonly fx: Effects;
  readonly ground: Ground;
  readonly cam: Camera;
  private acc = 0;
  private overSeen = false;

  constructor(private readonly o: SessionOptions) {
    this.world = new World({
      content: o.content,
      venue: o.venue,
      car: o.car,
      seed: o.seed,
      autopilot: o.autopilot,
      ...(o.field ? { field: o.field } : {}),
      ...(o.player ? { player: o.player } : {}),
      ...(o.knockout ? { knockout: true } : {}),
    });
    this.ground = makeGround(this.world);
    this.fx = new Effects(this.world, o.art, this.ground, o.sound);
    const P = this.world.player;
    this.cam = { x: P.x, y: P.y, shake: 0 };
  }

  /** One fixed tick: read input, step the world, play its events, move the camera. */
  step(): void {
    const w = this.world;
    const P = w.player;
    w.step(this.o.input.read(P.h));
    this.fx.handle(w.takeEvents());
    this.fx.afterStep();
    if (!P.ai) this.o.sound.engineSet(Math.abs(P.vf), P.throttle, P.boosting);
    // the camera looks ahead of the car, the way it is going
    const lead = 0.42;
    const tx = P.x + Math.max(-110, Math.min(110, P.vx * lead));
    const ty = P.y + Math.max(-80, Math.min(80, P.vy * lead));
    const k = Math.min(1, 4 * DT);
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
    this.cam.shake = this.fx.shake;
  }

  /** Advance by dt seconds of real time. Returns true once the race is over (the first time). */
  advance(dt: number): boolean {
    this.acc += dt;
    let n = 0;
    while (this.acc >= DT && n < MAX_STEPS) {
      this.step();
      this.acc -= DT;
      n++;
    }
    if (n === MAX_STEPS) this.acc = 0;
    if (this.world.phase === 'over' && !this.overSeen) {
      this.overSeen = true;
      return true;
    }
    return false;
  }

  resetClock(): void {
    this.acc = 0;
  }
}
