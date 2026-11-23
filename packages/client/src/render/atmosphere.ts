/**
 * The sky over a race, as the renderer needs it: how dark it is, how wet the ground, how much snow
 * lies. Client only: nothing here is in the sim, so two screens of one online race may differ.
 * Whoever knows the weather (a venue, a world modifier, the test range) sets `dark`, `wet` and
 * `snow`; the picture follows over a second or so, and `update` works out the light from them.
 *
 * Day keeps the look the art was drawn for: a flat top gets exactly its painted colour, a side
 * turned to the sun a little more, a side turned away a little less. As it darkens the sun goes
 * low and orange, then gives way to a dim blue moon; lamps come up as the light goes down.
 */

import { SUN } from './cast';

type Rgb = readonly [number, number, number];

/** The light at three times: [ambient, sun or moon, how high the sun is (z of its direction)]. */
const KEYS: readonly { at: number; amb: Rgb; sun: Rgb; high: number; glow: number }[] = [
  { at: 0, amb: [0.68, 0.7, 0.74], sun: [0.47, 0.45, 0.4], high: 0.68, glow: 0.12 },
  { at: 0.5, amb: [0.5, 0.43, 0.52], sun: [0.7, 0.42, 0.2], high: 0.4, glow: 0.7 },
  { at: 1, amb: [0.2, 0.25, 0.4], sun: [0.16, 0.2, 0.32], high: 0.62, glow: 1 },
];

/** How dark it must be before cars put their headlamps on. */
export const LAMPS_AT = 0.42;

const ease = (now: number, to: number, k: number): number =>
  Math.abs(to - now) < 0.002 ? to : now + (to - now) * k;

export class Atmosphere {
  /** Where the sky is heading: 0 day, 0.5 dusk, 1 night; wet and snow 0 to 1. */
  dark = 0;
  wet = 0;
  snow = 0;
  /** Light everything flat, as before there was a sky (weak phones, and to compare). */
  flat = false;
  /** Where it is now (these follow the three above). */
  readonly now = { dark: 0, wet: 0, snow: 0 };
  /** What the shaders are given. */
  readonly amb = new Float32Array([1, 1, 1]);
  readonly sun = new Float32Array(3);
  readonly dir = new Float32Array([0, 0, 1]);
  /** The light on flat open ground: ambient plus the sun on a flat top. */
  readonly ground = new Float32Array([1, 1, 1]);
  glow = 0;
  /** How strong cast shadows are, 0 to 1 (they go as the sun does). */
  shade = 1;
  /** Seconds, for ripples. */
  time = 0;

  /** Jump to the targets at once (a new race, a capture). */
  snap(): void {
    this.now.dark = this.dark;
    this.now.wet = this.wet;
    this.now.snow = this.snow;
    this.update(0);
  }

  get lamps(): boolean {
    return !this.flat && this.now.dark >= LAMPS_AT;
  }

  /** Is anything other than a plain day being drawn? */
  get plain(): boolean {
    return this.flat || (this.now.dark === 0 && this.now.wet === 0 && this.now.snow === 0);
  }

  update(dt: number): void {
    const n = this.now;
    const k = Math.min(1, dt * 1.6);
    n.dark = ease(n.dark, Math.min(1, Math.max(0, this.dark)), k);
    n.wet = ease(n.wet, Math.min(1, Math.max(0, this.wet)), k);
    // snow settles slowly and goes slowly
    n.snow = ease(n.snow, Math.min(1, Math.max(0, this.snow)), Math.min(1, dt * 0.5));
    this.time += dt;
    if (this.flat) {
      this.amb.fill(1);
      this.sun.fill(0);
      this.ground.fill(1);
      this.dir.set([0, 0, 1]);
      this.glow = 0;
      this.shade = 1;
      return;
    }
    const hi = n.dark <= 0.5 ? 1 : 2;
    const a = KEYS[hi - 1]!;
    const b = KEYS[hi]!;
    const f = (n.dark - a.at) / (b.at - a.at);
    const mix = (x: number, y: number) => x + (y - x) * f;
    // overcast: rain and snow take the edge off the sun and grey the light a little
    const cast = 1 - 0.45 * Math.max(n.wet, n.snow * 0.7);
    for (let i = 0; i < 3; i++) {
      this.amb[i] = mix(a.amb[i]!, b.amb[i]!) * (1 - 0.06 * (1 - cast));
      this.sun[i] = mix(a.sun[i]!, b.sun[i]!) * cast;
    }
    // towards the sun: opposite to the way shadows are thrown on the ground (cast.ts), and lower
    // than the shadows' length says, so walls take the light
    const high = mix(a.high, b.high);
    const flatLen = Math.hypot(SUN[0], SUN[1]);
    const h = Math.sqrt(1 - high * high);
    this.dir[0] = (-SUN[0] / flatLen) * h;
    this.dir[1] = (-SUN[1] / flatLen) * h;
    this.dir[2] = high;
    for (let i = 0; i < 3; i++) this.ground[i] = this.amb[i]! + this.sun[i]! * high;
    this.glow = mix(a.glow, b.glow);
    this.shade = cast * (n.dark <= 0.5 ? 1 - n.dark * 0.4 : 0.8 - (n.dark - 0.5) * 0.9);
  }
}

/** Named skies for the test range, the address bar (`?sky=`) and captures. */
export const SKIES: Record<string, { dark: number; wet: number; snow: number }> = {
  day: { dark: 0, wet: 0, snow: 0 },
  dusk: { dark: 0.5, wet: 0, snow: 0 },
  night: { dark: 1, wet: 0, snow: 0 },
  rain: { dark: 0.18, wet: 1, snow: 0 },
  storm: { dark: 0.72, wet: 1, snow: 0 },
  snow: { dark: 0.15, wet: 0, snow: 1 },
  'snow-night': { dark: 1, wet: 0, snow: 1 },
};
