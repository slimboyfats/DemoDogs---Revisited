import type { StaticProp } from '@demodogs/sim';
import type { Strip } from './stack';
import type { StackSink } from './stacks';
import type { Chip } from './strips';

/**
 * Buildings coming down. A tower that topples is drawn from its own slices, tipped over: each
 * slice is a flat sheet, so leaning the stack means sliding every slice out along the fall and
 * down by how high it stood. Lying flat, the slices lie one after another along the ground, as
 * long as the sim says the fall reaches. Pure apart from the list it keeps.
 */
export interface Toppling {
  s: StaticProp;
  strip: Strip;
  /** Slices still standing when it went. */
  layers: number;
  /** Which way it falls, and how far its top lands from its foot (art px). */
  a: number;
  len: number;
  t: number;
  dur: number;
}

/** A fall that lasts longer the taller it was: about a second for a tower. */
export function fallTime(height: number): number {
  return 0.35 + Math.sqrt(Math.max(0, height)) * 0.1;
}

/** How far over it has gone, 0 standing to pi/2 flat: slow at first, then faster, as things fall. */
export function tilt(t: number, dur: number): number {
  const k = Math.min(1, Math.max(0, t / dur));
  return (Math.PI / 2) * k * k;
}

/** Where slice height h (art px) is drawn at tilt th: out along the fall, and how high. */
export function lean(h: number, height: number, len: number, th: number): [number, number] {
  // flat on the ground the stack spreads to the length the sim laid its rubble over
  const stretch = 1 + (Math.max(height, len) / Math.max(1, height) - 1) * Math.sin(th);
  return [h * Math.sin(th) * stretch, h * Math.cos(th)];
}

export function queueToppling(R: StackSink, list: readonly Toppling[]): void {
  for (const T of list) {
    const S = T.strip;
    const height = T.layers / S.res;
    const th = tilt(T.t, T.dur);
    const cs = Math.cos(T.a);
    const sn = Math.sin(T.a);
    const mx = T.s.x + cs * T.len * 0.5;
    const my = T.s.y + sn * T.len * 0.5;
    if (!R.visible(mx, my, T.len * 0.6 + T.s.def.radius + 8, height)) continue;
    R.group(T.s.y);
    for (let i = 0; i < T.layers; i++) {
      const [o, z] = lean(i / S.res, height, T.len, th);
      R.slice(S, i, T.s.x + cs * o, T.s.y + sn * o, z, T.s.rot);
    }
  }
}

/**
 * The blocks of a fallen tower, laid out along where it landed: each block of height z goes out
 * along the fall (in the strip's own frame, turned by `rot`) by as far as that height reached.
 */
export function laidOut(
  chips: readonly Chip[],
  a: number,
  rot: number,
  height: number,
  len: number,
): Chip[] {
  const k = Math.max(height, len) / Math.max(1, height);
  const da = a - rot;
  const ux = Math.cos(da);
  const uy = Math.sin(da);
  return chips.map((c) => ({ ...c, x: c.x + ux * c.z * k, y: c.y + uy * c.z * k, z: c.s * 0.5 }));
}

/** The blocks of one floor: those between heights z0 and z1 (art px). */
export function floorOf(chips: readonly Chip[], z0: number, z1: number): Chip[] {
  return chips.filter((c) => c.z >= z0 && c.z < z1);
}
