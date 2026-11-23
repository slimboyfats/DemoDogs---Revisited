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
  /**
   * A car's shield bubble: put `up`, struck at (x, y) (`hit`, `amount` soaked up), burst by one
   * blow too many (`pop`, at the blow) or run out of time (`fade`). `left` is the share it has left.
   */
  | {
      t: 'shield';
      car: number;
      what: 'up' | 'hit' | 'pop' | 'fade';
      x: number;
      y: number;
      amount: number;
      left: number;
    }
  /** A car's welding: under way (`start`), a lost `part` put back on, or finished (`done`). */
  | { t: 'weld'; car: number; what: 'start' | 'part' | 'done'; part?: CarPart }
  | { t: 'fire'; car: number; weapon: string }
  /** A car rolled over a spike at (x, y) and has a flat tyre. */
  | { t: 'puncture'; car: number; x: number; y: number }
  /** A shock pulse went out from (x, y), spreading to radius r over `life` seconds. */
  | { t: 'pulse'; car: number; x: number; y: number; r: number; life: number }
  /** A bolt of charge jumped from (x, y, z) to (tx, ty, tz). */
  | { t: 'arc'; x: number; y: number; z: number; tx: number; ty: number; tz: number }
  /** A car's engine was cut by a shock for `time` seconds. */
  | { t: 'stall'; car: number; by: number; time: number }
  /** A car's blade (pickup `id`) was bolted on (`on`) or wore out and fell off, at (x, y). */
  | { t: 'blade'; car: number; id: string; on: boolean; x: number; y: number }
  /** A car's springs threw it up at (x, y) to clear the ground ahead. */
  | { t: 'hop'; car: number; x: number; y: number }
  /** A sprung car came down at (x, y); impact is how fast it was falling. */
  | { t: 'touchdown'; car: number; x: number; y: number; impact: number }
  /** A rail slug flew from (x, y) to (tx, ty), through whatever it struck. */
  | { t: 'rail'; car: number; x: number; y: number; tx: number; ty: number }
  /** A sticky bomb clung to a car (`car`), or came to rest on the ground (-1), at (x, y). */
  | { t: 'stick'; car: number; x: number; y: number }
  /** A car carrying a sticky bomb handed it on to another by touching it. */
  | { t: 'pass'; from: number; to: number; x: number; y: number }
  /** Lightning from a coil: through the points [x0, y0, x1, y1, ...]. */
  | { t: 'lightning'; car: number; pts: number[] }
  /** A suction orb anchored at (x, y) and began to pull everything within r. */
  | { t: 'orb'; x: number; y: number; r: number }
  /** A spray's drop struck something at (x, y): `lit` drops burn, others splash. */
  | { t: 'splash'; x: number; y: number; lit: boolean }
  /** A round from a car's gun, from (x, y) to (tx, ty); `hit` is the car it struck, or -1. */
  | { t: 'shot'; car: number; x: number; y: number; tx: number; ty: number; hit: number }
  | { t: 'score'; car: number; x: number; y: number; points: number; label: string }
  | { t: 'countdown'; n: number }
  | { t: 'go' }
  | { t: 'final-lap'; car: number }
  | { t: 'finish'; car: number; place: number }
  | { t: 'over' };

export type SimEventType = SimEvent['t'];
