import { Shape } from './batch';

/**
 * Cosmetic particles, after mudders' particle kinds (packages/client/src/render/pixel/particles.ts)
 * but with a height: every particle lives at (x, y) on the ground and z above it, so fire rises
 * off a wreck and a smoke column stands up out of the picture. They are drawn as mudders draws
 * them: blobs of whole cells in flat tones that step through hard colour bands, never soft sprites.
 * Purely visual and never fed back into the sim.
 */
export type FxKind =
  /** One bright additive cell: flies, falls and bounces. */
  | 'spark'
  /** A firework star: flies out fast, brakes hard in the air, droops and strobes as it burns out. */
  | 'glitter'
  /** A glowing ember shed by fire: floats up on the heat, sways and flickers out. */
  | 'ember'
  /** Fire: a pixel blob that rises, steps yellow, orange, red, soot in hard bands and shrinks out. */
  | 'flame'
  /** A smoke-column puff: rises, slows and spreads as it ages, leans downwind, pales as it thins. */
  | 'plume'
  /** Thin tyre smoke: a stippled cloud of single cells. */
  | 'smoke'
  /** Dust kicked off the dirt: a stippled cloud hugging the ground. */
  | 'dust';

export interface Particle {
  kind: FxKind;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Seconds left, and the seconds it was born with. */
  life: number;
  max: number;
  /** Width in art pixels (cells). */
  size: number;
  /** 0xRRGGBB; flames ignore it and use the fire ramp. */
  rgb: number;
}

/** Flame colour bands over its life (mudders' FLAME_RAMP). */
export const FLAME_RAMP = [0xfff0a0, 0xffa020, 0xe04a10, 0x3a2a26] as const;
/** Fresh smoke off a fire, and the thinner smoke off a hurt engine. */
export const SOOT = 0x2c2826;
export const HAZE = 0x6a6660;

/** The steady wind every smoke column leans on, art px per second squared. */
export const WIND: readonly [number, number] = [16, -5];

/** Multiply a colour's channels by k (mudders' theme.shade). */
export function shade(rgb: number, k: number): number {
  const r = Math.min(255, Math.round(((rgb >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((rgb >> 8) & 255) * k));
  const b = Math.min(255, Math.round((rgb & 255) * k));
  return (r << 16) | (g << 8) | b;
}

/** How far through its life a particle is: 0 new, 1 gone. */
export const age = (p: Particle): number => 1 - p.life / p.max;

/** One tick of motion. Returns false when the particle has burnt out. */
export function stepParticle(p: Particle, dt: number): boolean {
  p.life -= dt;
  if (p.life <= 0) return false;
  const t = age(p);
  switch (p.kind) {
    case 'spark': {
      p.vz -= 300 * dt;
      break;
    }
    case 'glitter': {
      const f = Math.exp(-4.5 * dt);
      p.vx *= f;
      p.vy *= f;
      p.vz = p.vz * f - 60 * dt;
      break;
    }
    case 'ember': {
      const f = Math.exp(-2 * dt);
      // sways on the heat: each ember has its own phase, from where it was born
      const sway = Math.sin(p.life * 9 + p.max * 40) * 30;
      p.vx = p.vx * f + (sway + WIND[0]) * dt;
      p.vy = p.vy * f + WIND[1] * dt;
      p.vz = p.vz * f + 40 * dt;
      break;
    }
    case 'flame': {
      const f = Math.exp(-5 * dt);
      p.vx *= f;
      p.vy *= f;
      p.vz = p.vz * Math.exp(-3 * dt) + 110 * dt;
      break;
    }
    case 'plume': {
      // buoyant while young, then hangs; the wind takes it harder the higher it climbs
      const f = Math.exp(-1.4 * dt);
      const lean = 0.25 + t * 1.1;
      p.vx = p.vx * f + WIND[0] * lean * dt;
      p.vy = p.vy * f + WIND[1] * lean * dt;
      p.vz = p.vz * Math.exp(-0.9 * dt) + 22 * (1 - t) * dt;
      break;
    }
    default: {
      const f = Math.exp(-2.4 * dt);
      p.vx *= f;
      p.vy *= f;
      p.vz *= f;
    }
  }
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.z += p.vz * dt;
  if (p.z < 0) {
    p.z = 0;
    p.vz = p.kind === 'spark' ? -p.vz * 0.4 : 0;
  }
  return true;
}

/** Where a drawn blob goes: a renderer's batch, or a test's list. */
export type Put = (
  x: number,
  y: number,
  z: number,
  size: number,
  rgb: number,
  alpha: number,
  shape: Shape,
) => void;

/** Plume alpha per life band when drawn dithered (fresh puffs and the thinning top). */
const PLUME_ALPHA = [0.6, 0.6, 0.6, 0.55, 0.3] as const;

/**
 * Draw one particle the way mudders does: `normal` takes the opaque and dithered blobs, `glow`
 * the additive cells (sparks, embers, the hot core of a flame).
 */
export function drawParticle(p: Particle, normal: Put, glow: Put): void {
  const t = age(p);
  const s = p.size;
  switch (p.kind) {
    case 'spark':
      glow(p.x, p.y, p.z, 1, p.rgb, t < 0.6 ? 1 : (1 - t) / 0.4, Shape.Rect);
      break;
    case 'glitter':
      // full on, then strobing as it burns out
      if (t > 0.55 && (Math.floor(p.life * 30) & 1) === 0) break;
      glow(p.x, p.y, p.z, s, p.rgb, t < 0.55 ? 1 : 0.85, Shape.Rect);
      break;
    case 'ember':
      if (t > 0.4 && (Math.floor(p.life * 20 + p.max * 50) & 3) === 0) break;
      glow(p.x, p.y, p.z, 1, t < 0.5 ? 0xffc040 : 0xe05a18, 1, Shape.Rect);
      break;
    case 'flame': {
      const band = Math.min(3, Math.floor(t * 4));
      const sz = Math.max(1, Math.round(s * (1 - t * 0.6)));
      normal(p.x, p.y, p.z, sz, FLAME_RAMP[band]!, band === 3 ? 0.7 : 1, Shape.Pixel);
      if (band < 2) glow(p.x, p.y, p.z, Math.max(1, sz - 2), 0xffd060, 0.5, Shape.Rect);
      break;
    }
    case 'plume': {
      const band = Math.min(4, Math.floor(t * 5));
      // spreads out as it climbs; whole-cell sizes so the blob edge stays crisp
      const sz = Math.round(s * (1 + t * 2.4));
      const col = band < 2 ? p.rgb : shade(p.rgb, band === 2 ? 1.2 : band === 3 ? 1.4 : 1.55);
      // dense smoke as opaque blobs in flat tones; thinning smoke as a dithered blob
      const solid = band < 3 && p.max - p.life >= 0.1;
      normal(
        p.x,
        p.y,
        p.z,
        sz,
        col,
        solid ? 1 : PLUME_ALPHA[band]!,
        solid ? Shape.Solid : Shape.Pixel,
      );
      break;
    }
    default: {
      const grow = p.kind === 'smoke' ? 1 + t * 2.2 : 1 + t * 1.4;
      const a = (p.kind === 'smoke' ? 0.75 : 0.6) * (1 - t) * Math.min(1, t * 6 + 0.2);
      normal(p.x, p.y, p.z, s * grow, p.rgb, a, Shape.Stipple);
    }
  }
}

/** Flames are drawn over smoke, so a fire shows through its own column. */
export const overSmoke = (p: Particle): boolean => p.kind === 'flame';
