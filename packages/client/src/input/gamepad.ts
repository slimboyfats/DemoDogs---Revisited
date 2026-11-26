import type { Controls } from '@demodogs/shared';
import { toControls, type RawInput } from './controls';

/** What is read off a gamepad: the browser's `Gamepad`, or anything shaped like it. */
export interface PadState {
  readonly axes: readonly number[];
  readonly buttons: readonly { readonly pressed: boolean; readonly value: number }[];
}

/**
 * The buttons of a standard gamepad, by what they do here. Driving works two ways at once: push
 * the left stick where the car should go (the same as the touch stick), or hold the right
 * trigger for gas and the left for brake and steer with the stick or the d-pad.
 */
export const PAD = {
  boost: [0, 4],
  brake: [1],
  fire: [2, 5],
  brakePedal: 6,
  gasPedal: 7,
  back: 8,
  start: 9,
  up: 12,
  down: 13,
  left: 14,
  right: 15,
} as const;

/** How far a stick or a trigger is off its rest before it counts. */
export const PAD_DEAD = 0.2;

const down = (p: PadState, i: number): boolean => p.buttons[i]?.pressed ?? false;
const any = (p: PadState, list: readonly number[]): boolean => list.some((i) => down(p, i));
const value = (p: PadState, i: number): number => p.buttons[i]?.value ?? 0;

/** Is FIRE held? (A fire press is the moment this turns true.) */
export function padFire(p: PadState): boolean {
  return any(p, PAD.fire);
}

/** Controls from a gamepad for a car facing `heading`, or null while nothing on it is touched. */
export function padControls(p: PadState, heading: number): Controls | null {
  const x = p.axes[0] ?? 0;
  const y = p.axes[1] ?? 0;
  const mag = Math.min(1, Math.hypot(x, y));
  const gas = value(p, PAD.gasPedal);
  const brakePedal = value(p, PAD.brakePedal);
  const brake = any(p, PAD.brake) || brakePedal > 0.3;
  const boost = any(p, PAD.boost);
  if (gas > 0.05 || brakePedal > 0.05) {
    // pedals: the stick (or the d-pad) only steers, gently near the middle
    const pad = (down(p, PAD.right) ? 1 : 0) - (down(p, PAD.left) ? 1 : 0);
    const push = Math.abs(x) > PAD_DEAD ? (Math.abs(x) - PAD_DEAD) / (1 - PAD_DEAD) : 0;
    const steer = pad || Math.sign(x) * Math.min(1, push) ** 1.4;
    return { steer, throttle: Math.min(1, gas), brake, boost, fire: false };
  }
  const raw: RawInput = {
    up: down(p, PAD.up),
    down: down(p, PAD.down),
    left: down(p, PAD.left),
    right: down(p, PAD.right),
    stick: { active: mag > PAD_DEAD, mag, angle: Math.atan2(y, x) },
    brake,
    boost,
    fire: false,
  };
  const idle = !raw.up && !raw.down && !raw.left && !raw.right && !raw.stick.active;
  if (idle && !brake && !boost) return null;
  return toControls(raw, heading);
}

/** Which way the stick or the d-pad points, for moving round a menu; null at rest. */
export type PadWay = 'up' | 'down' | 'left' | 'right';
export function padWay(p: PadState): PadWay | null {
  if (down(p, PAD.up)) return 'up';
  if (down(p, PAD.down)) return 'down';
  if (down(p, PAD.left)) return 'left';
  if (down(p, PAD.right)) return 'right';
  const x = p.axes[0] ?? 0;
  const y = p.axes[1] ?? 0;
  if (Math.max(Math.abs(x), Math.abs(y)) < 0.55) return null;
  return Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : y > 0 ? 'down' : 'up';
}

/** Seconds a way is held before it repeats, and between repeats after that. */
const REPEAT_FIRST = 0.38;
const REPEAT_NEXT = 0.13;

/** What happened on the gamepad this frame, for the menus. */
export interface PadFrame {
  /** A step this way (a press, or a held way repeating). */
  way: PadWay | null;
  /** Pressed this frame: A, B, START. */
  ok: boolean;
  back: boolean;
  start: boolean;
}

const NOTHING: PadFrame = { way: null, ok: false, back: false, start: false };

/**
 * The gamepad, read once a frame: the first one plugged in that has been touched. It keeps what
 * is held for the car, turns presses into moments (a fire press, START), and repeats a held way
 * for the menus. `read` is the browser's `navigator.getGamepads`, or a stand-in.
 */
export class Pads {
  /** The pad as it is now, or null with none (or with gamepads switched off). */
  state: PadState | null = null;
  /** The pad itself, to rumble. */
  device: Gamepad | null = null;
  /** A fire press not yet taken by the car. */
  private fireDue = false;
  private wasFire = false;
  private was = { ok: false, back: false, start: false };
  private held: PadWay | null = null;
  private wait = 0;
  /** True once any pad has been used: the menus then show where it is. */
  used = false;

  constructor(
    private readonly read: () => readonly (Gamepad | PadState | null)[],
    private readonly enabled: () => boolean,
  ) {}

  /** Read the pad. Returns what was pressed this frame. */
  poll(dt: number): PadFrame {
    let found: Gamepad | PadState | null = null;
    if (this.enabled())
      try {
        for (const g of this.read()) {
          if (!g || ('connected' in g && !g.connected) || g.buttons.length < 10) continue;
          found = g;
          break;
        }
      } catch {
        /* not allowed here: no gamepad */
      }
    this.state = found;
    this.device = found && 'id' in found ? found : null;
    if (!found) {
      this.wasFire = false;
      this.was = { ok: false, back: false, start: false };
      this.held = null;
      return NOTHING;
    }
    const fire = padFire(found);
    if (fire && !this.wasFire) this.fireDue = true;
    this.wasFire = fire;
    const now = { ok: down(found, 0), back: down(found, 1), start: down(found, PAD.start) };
    const out: PadFrame = {
      way: null,
      ok: now.ok && !this.was.ok,
      back: now.back && !this.was.back,
      start: now.start && !this.was.start,
    };
    this.was = now;
    const way = padWay(found);
    if (way !== this.held) {
      this.held = way;
      this.wait = REPEAT_FIRST;
      out.way = way;
    } else if (way) {
      this.wait -= dt;
      if (this.wait <= 0) {
        this.wait = REPEAT_NEXT;
        out.way = way;
      }
    }
    if (out.way || out.ok || out.back || out.start || fire) this.used = true;
    return out;
  }

  /** The car's controls from the pad, or null while it is left alone. */
  controls(heading: number): Controls | null {
    return this.state ? padControls(this.state, heading) : null;
  }

  /** A fire press since this was last asked. */
  takeFire(): boolean {
    const f = this.fireDue;
    this.fireDue = false;
    return f;
  }

  /** Shake the pad in the hand, where it can. */
  rumble(ms: number, strong: number, weak: number): void {
    const act = (
      this.device as unknown as {
        vibrationActuator?: {
          playEffect?: (type: string, o: Record<string, number>) => Promise<unknown>;
        };
      } | null
    )?.vibrationActuator;
    void act
      ?.playEffect?.('dual-rumble', {
        startDelay: 0,
        duration: ms,
        strongMagnitude: strong,
        weakMagnitude: weak,
      })
      ?.catch(() => undefined);
  }
}
