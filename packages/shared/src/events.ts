/**
 * Events the sim emits for the client to show and play: sparks, dents, debris, sound, floating
 * words. The sim never draws or plays anything itself; it only reports what happened.
 * Car, bot and prop fields are indices into the world's arrays.
 */
export type CarPart = 'front' | 'rear' | 'top';

export type SimEvent =
  /** A car took damage at (x, y); (lx, ly) is the same point in the car's own frame. */
  | {
      t: 'hit';
      car: number;
      by: number;
      x: number;
      y: number;
      lx: number;
      ly: number;
      amount: number;
    }
  /** Two hard things met. impact is the closing speed. */
  | { t: 'crash'; x: number; y: number; impact: number; player: boolean }
  | { t: 'scrape'; x: number; y: number; player: boolean }
  | {
      t: 'detach';
      car: number;
      part: CarPart;
      x: number;
      y: number;
      z: number;
      vx: number;
      vy: number;
    }
  | { t: 'wreck'; car: number; by: number }
  | { t: 'respawn'; car: number }
  | { t: 'land'; car: number; impact: number }
  | { t: 'explode'; x: number; y: number; power: number }
  | { t: 'smash'; bot: number; by: number; x: number; y: number; vx: number; vy: number }
  | { t: 'bot-spawn'; bot: number }
  /** A piece was knocked off scenery (world.statics[prop]) at (x, y). */
  | {
      t: 'chip';
      prop: number;
      x: number;
      y: number;
      amount: number;
      by: 'blast' | 'impact' | 'heat';
    }
  /** That piece of scenery came down for good. */
  | { t: 'fall'; prop: number; x: number; y: number }
  /**
   * A tree lost `amount` of a full crown of leaves and has `left`: torn off by a blast at (x, y),
   * burnt off, or shaken loose by a ram there.
   */
  | {
      t: 'strip';
      prop: number;
      x: number;
      y: number;
      amount: number;
      left: number;
      by: 'blast' | 'heat' | 'shake';
    }
  /** A blast dug a pit of radius r in the ground (or widened one that was there). */
  | { t: 'crater'; x: number; y: number; r: number }
  /** A pool of a material poured out on the ground. */
  | { t: 'spill'; material: string; x: number; y: number; r: number }
  /** Fire was put out here. */
  | { t: 'quench'; x: number; y: number; r: number }
  /** A fuel drum burst open and is rocketing up. */
  | { t: 'launch'; prop: number; x: number; y: number }
  /** Something blew apart in the air at height z. */
  | { t: 'airburst'; x: number; y: number; z: number; power: number }
  /** A burning star landed and popped. */
  | { t: 'pop'; x: number; y: number }
  /** A pool of fire started burning: radius r, for `life` seconds. */
  | { t: 'blaze'; x: number; y: number; r: number; life: number }
  | { t: 'break'; prop: number; x: number; y: number; vx: number; vy: number }
  | { t: 'pickup'; car: number; x: number; y: number; label: string; kind: string }
  | { t: 'fire'; car: number; weapon: string }
  /** A round from a car's gun, from (x, y) to (tx, ty); `hit` is the car it struck, or -1. */
  | { t: 'shot'; car: number; x: number; y: number; tx: number; ty: number; hit: number }
  | { t: 'score'; car: number; x: number; y: number; points: number; label: string }
  | { t: 'countdown'; n: number }
  | { t: 'go' }
  | { t: 'final-lap'; car: number }
  | { t: 'finish'; car: number; place: number }
  | { t: 'over' };

export type SimEventType = SimEvent['t'];
