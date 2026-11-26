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
  /** A car off the course in a race was put back on the road, from (x, y). */
  | { t: 'rescue'; car: number; x: number; y: number }
  | { t: 'land'; car: number; impact: number }
  /** z: up on a deck, art px; absent on the ground. */
  | { t: 'explode'; x: number; y: number; power: number; z?: number }
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
  /** A building (world.statics[prop]) lost its top floor at (x, y) and has `left` standing. */
  | { t: 'storey'; prop: number; left: number; x: number; y: number }
  /** It fell over with `left` floors standing, towards angle `a`, `len` art px long. */
  | { t: 'topple'; prop: number; left: number; a: number; len: number }
  /** A fallen prop starts flying back together; it stands again `in` seconds from now. */
  | { t: 'mend'; prop: number; in: number }
  /**
   * A raised road lost what held it up when world.statics[prop] came down at (x, y): `pieces`
   * of its deck are sagging (their `sagT` runs down) and will fall one after another.
   */
  | { t: 'sag'; prop: number; x: number; y: number; pieces: number }
  /** A rebuilt prop stands again. */
  | { t: 'stand'; prop: number }
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
  /** A press (world.statics[prop]) slammed shut at (x, y); `caught` cars were under it. */
  | { t: 'press'; prop: number; x: number; y: number; caught: number }
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
  /**
   * A car's guard (pickup `id`, a GuardKind `kind`): fitted (`on`), gone (`off`: spent, run out or
   * lost in a wreck) or at work (`use`) at (x, y). A `use` that reaches somewhere (a shot brought
   * down, a round sent back, a blow passed on, a mine tripped) has that place in (tx, ty), and
   * the car it lands on instead (a round sent back to its shooter) in `to`.
   */
  | {
      t: 'guard';
      car: number;
      id: string;
      kind: string;
      what: 'on' | 'off' | 'use';
      x: number;
      y: number;
      tx?: number;
      ty?: number;
      to?: number;
    }
  | { t: 'fire'; car: number; weapon: string }
  /** A car rolled over a spike at (x, y) and has a flat tyre. */
  | { t: 'puncture'; car: number; x: number; y: number }
  /** A shock pulse went out from (x, y), spreading to radius r over `life` seconds. */
  | { t: 'pulse'; car: number; x: number; y: number; r: number; life: number }
  /** A bolt of charge jumped from (x, y, z) to (tx, ty, tz). */
  | { t: 'arc'; x: number; y: number; z: number; tx: number; ty: number; tz: number }
  /** A howl's shockwave went out from (x, y) on level z, running to radius r over `life` seconds. */
  | { t: 'howl'; car: number; x: number; y: number; z: number; r: number; life: number }
  /**
   * The shockwave threw something at (x, y, z) away along (dx, dy), a unit vector: `what` says what
   * (a car has its index in `car`).
   */
  | {
      t: 'hurl';
      what: 'car' | 'prop' | 'shot' | 'bot';
      car?: number;
      x: number;
      y: number;
      z: number;
      dx: number;
      dy: number;
    }
  /** A car's engine was cut by a shock for `time` seconds. */
  | { t: 'stall'; car: number; by: number; time: number }
  /**
   * A catch-up item at work on `car` at (x, y), set off by car `by` (-1: nobody): it swelled up
   * (`grow`) or was zapped small (`shrink`), came back to its own size (`back`), was flattened
   * under a much bigger car (`squash`), got a second wind (`wind`), had a lead collar clamped on or
   * drop off (`collar`, `collar-off`; `id` is the pickup), or bones were called down on it (`bones`).
   */
  | {
      t: 'catchup';
      what: 'grow' | 'shrink' | 'back' | 'squash' | 'wind' | 'collar' | 'collar-off' | 'bones';
      car: number;
      by: number;
      id: string;
      x: number;
      y: number;
    }
  /**
   * A trick (pickup `id`, a TrickKind `kind`) set off by car `by`: it came to work on `car`
   * (`on`), let go of it (`off`), or did something there and then at (x, y) (`use`). A `use` that
   * reaches somewhere has that place in (tx, ty) (a dog door's way out), the other car in it in
   * `to` (the car struck, robbed or tied to), and what changed hands in `label`.
   */
  | {
      t: 'trick';
      kind: string;
      what: 'on' | 'off' | 'use';
      car: number;
      by: number;
      id: string;
      x: number;
      y: number;
      tx?: number;
      ty?: number;
      to?: number;
      label?: string;
    }
  /** A car's blade (pickup `id`) was bolted on (`on`) or wore out and fell off, at (x, y). */
  | { t: 'blade'; car: number; id: string; on: boolean; x: number; y: number }
  /** A car's springs threw it up at (x, y) to clear the ground ahead. */
  | { t: 'hop'; car: number; x: number; y: number }
  /** A sprung car came down at (x, y); impact is how fast it was falling. */
  | { t: 'touchdown'; car: number; x: number; y: number; impact: number }
  /**
   * An add-on (pickup `id`) was bolted onto a car (`on`), or came off it at (x, y): `spent` when
   * it was used up or struck off, otherwise it ran out of time.
   */
  | { t: 'addon'; car: number; id: string; on: boolean; x: number; y: number; spent?: boolean }
  /** A car's plate (pickup `id`) blew off at (x, y) under a blow; it has `left`. */
  | { t: 'plate'; car: number; id: string; x: number; y: number; left: number }
  /** A car's magnet pulled in the pickup at (x, y). */
  | { t: 'fetch'; car: number; x: number; y: number }
  /** A car's jaws tore `armor` points off car `from` at (x, y) and it was paid `cash` for them. */
  | { t: 'chew'; car: number; from: number; x: number; y: number; armor: number; cash: number }
  /** A car's spiked hubs ground into another car at (x, y). */
  | { t: 'grind'; car: number; x: number; y: number }
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
  /** A thrown stick came back to the hand of the car that threw it. */
  | { t: 'catch'; car: number; x: number; y: number }
  /** A hook bit car `to` at (x, y) and tied it to car `from`. */
  | { t: 'leash'; from: number; to: number; x: number; y: number }
  /** A line between two cars parted, at (x, y). */
  | { t: 'snap'; x: number; y: number }
  /** A shell is on its way down to (x, y) and lands `in` seconds from now. */
  | { t: 'incoming'; x: number; y: number; in: number }
  /** A turret at (x, y) was set down, was run over, or ran out of rounds or time. */
  | { t: 'sentry'; what: 'up' | 'crushed' | 'spent'; x: number; y: number }
  /** A flea jumped onto a car at (x, y). */
  | { t: 'flea'; car: number; x: number; y: number }
  /** A car's cutting ray came on or went off. */
  | { t: 'beam'; car: number; on: boolean }
  /** Cars a and b changed places: a was at (ax, ay) and b at (bx, by). */
  | { t: 'swap'; a: number; b: number; ax: number; ay: number; bx: number; by: number }
  /** The ground split open at (x, y), the crack running along heading h. */
  | { t: 'crack'; x: number; y: number; h: number }
  /** A bone out of the sky landed at (x, y) (its blast is an `explode` of its own). */
  | { t: 'meteor'; x: number; y: number }
  /** A pit of radius r was dug at (x, y); it will be there for `life` seconds. */
  | { t: 'pit'; x: number; y: number; r: number; life: number }
  /** A car fell into the pit at (x, y): down for `time` seconds, or `gone` for good. */
  | { t: 'trap'; car: number; x: number; y: number; time: number; gone: boolean }
  /** A car was thrown back out of the pit at (x, y). */
  | { t: 'unpit'; car: number; x: number; y: number }
  /** A car went down a pit that closed over it: it is out, with no wreck left. */
  | { t: 'buried'; car: number; by: number }
  /** The pit at (x, y) filled itself in. */
  | { t: 'fill'; x: number; y: number; r: number }
  /** A snap of cold went out from a car at (x, y) to radius r. */
  | { t: 'frost'; car: number; x: number; y: number; r: number }
  /** Something thrown (a stick, a hook, a bolt) was spent against something at (x, y). */
  | { t: 'fizz'; x: number; y: number }
  /** A spray's drop struck something at (x, y): `lit` drops burn, others splash. */
  | { t: 'splash'; x: number; y: number; lit: boolean }
  /** A round from a car's gun, from (x, y) to (tx, ty); `hit` is the car it struck, or -1. */
  | { t: 'shot'; car: number; x: number; y: number; tx: number; ty: number; hit: number }
  /** A car was thrown back off a sprung prop (world.statics[prop]) at (x, y), at `power` px a second. */
  | { t: 'bounce'; car: number; prop: number; x: number; y: number; power: number }
  /**
   * A car drove onto a track tile (world.statics[prop]) at (x, y): a boost tile kicked it on, or
   * a ramp threw it up, or a vent blew under it, or it pressed a switch. `power` is the push, the
   * speed it left the ramp at, the vent's lift, or (a switch) how many gates it opened.
   */
  | {
      t: 'pad';
      kind: 'boost' | 'jump' | 'vent' | 'switch';
      car: number;
      prop: number;
      x: number;
      y: number;
      power: number;
    }
  /**
   * A car's wheel dropped into a pothole (world.statics[prop]) at (x, y) at speed `power`, or
   * (`kind` hop) the road fell away under it over a crest and it left the ground going up at
   * `power`.
   */
  | {
      t: 'jolt';
      kind: 'hole' | 'hop';
      car: number;
      prop: number;
      x: number;
      y: number;
      power: number;
    }
  /**
   * An animal (world.critters[critter]) at (x, y): a car (or a blast, car -1) knocked it flying
   * (`flung`), a car ran into one too heavy to move (`bump`, with the closing speed as `power`),
   * or a bird took off (`up`) or came down (`down`). One that attacks has picked out `car` and
   * is pawing the ground (`wind`), has set off at it (`charge`), or has caught it (`gore`, with
   * the damage as `power`).
   */
  | {
      t: 'critter';
      what: 'flung' | 'bump' | 'up' | 'down' | 'wind' | 'charge' | 'gore';
      critter: number;
      car: number;
      x: number;
      y: number;
      power: number;
    }
  /** A car flattened a plant (world.statics[prop]) it drove over. */
  | { t: 'trample'; prop: number; car: number; x: number; y: number }
  /** A world modifier (its content id) came on or went off. */
  | { t: 'weather'; id: string; on: boolean }
  /** Something lands at (x, y) in `in` seconds and reaches r: a bolt, scrap from the sky, a quake. */
  | { t: 'omen'; what: 'bolt' | 'scrap' | 'quake'; x: number; y: number; r: number; in: number }
  /** Lightning out of the sky struck (x, y). */
  | { t: 'bolt'; x: number; y: number }
  /** Burning scrap out of the sky came down at (x, y). */
  | { t: 'skyfall'; x: number; y: number; power: number }
  /** The ground shakes for `time` seconds, hardest at (x, y) and out to r. */
  | { t: 'quake'; x: number; y: number; r: number; time: number }
  /** The ground split open along the points [x0, y0, x1, y1, ...]. */
  | { t: 'split'; pts: number[] }
  /** A gust: the wind (see world.wind) rises for `time` seconds. */
  | { t: 'gust'; time: number }
  /** Flood water at (x, y) has risen to radius r. */
  | { t: 'flood'; material: string; x: number; y: number; r: number }
  | { t: 'score'; car: number; x: number; y: number; points: number; label: string }
  | { t: 'countdown'; n: number }
  | { t: 'go' }
  | { t: 'final-lap'; car: number }
  | { t: 'finish'; car: number; place: number }
  | { t: 'over' };

export type SimEventType = SimEvent['t'];
