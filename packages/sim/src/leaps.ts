import type { LeapManifest, VenueManifest } from '@demodogs/shared';
import type { Content } from './content';

/**
 * Jumps in two pieces (props with a `leap`, see shared/pieces.ts): a takeoff that climbs to a
 * sheer lip and a landing that stands as high across a gap and runs back down. Each is raised
 * ground in the venue's one height map, so they are found before anything else is built: the
 * pieces a venue puts down by hand (its `place` rules, as a track from the track creator does).
 */
export interface LeapPiece {
  x: number;
  y: number;
  rot: number;
  def: LeapManifest;
}

/** The jump pieces venue `v` puts down by hand, where they stand. */
export function leapPieces(v: VenueManifest, content: Content): LeapPiece[] {
  const out: LeapPiece[] = [];
  const cx = v.oval ? v.oval.cx : v.size.w / 2;
  const cy = v.oval ? v.oval.cy : v.size.h / 2;
  for (const r of v.scenery) {
    if (r.rule !== 'place') continue;
    for (const i of r.items) {
      const def = content.prop.get(i.prop)?.leap;
      if (def) out.push({ x: cx + i.x, y: cy + i.y, rot: i.rot, def });
    }
  }
  return out;
}

/**
 * The gaps between takeoffs and their landings: from the middle of a takeoff's lip to the middle
 * of the back of the nearest landing ahead of it that points the same way (x0, y0, x1, y1, how
 * wide). A takeoff with none is a plain jump off a drop.
 */
export function leapGaps(pieces: readonly LeapPiece[]): [number, number, number, number, number][] {
  const out: [number, number, number, number, number][] = [];
  for (const a of pieces) {
    if (a.def.way !== 'up') continue;
    const ca = Math.cos(a.rot);
    const sa = Math.sin(a.rot);
    const x0 = a.x + ca * (a.def.long / 2);
    const y0 = a.y + sa * (a.def.long / 2);
    let best: [number, number, number, number, number] | null = null;
    let near = 600;
    for (const b of pieces) {
      if (b.def.way !== 'down') continue;
      const x1 = b.x - Math.cos(b.rot) * (b.def.long / 2);
      const y1 = b.y - Math.sin(b.rot) * (b.def.long / 2);
      const along = (x1 - x0) * ca + (y1 - y0) * sa;
      const off = Math.abs(-(x1 - x0) * sa + (y1 - y0) * ca);
      if (along <= 0 || along >= near || off > along * 0.5) continue;
      near = along;
      best = [x0, y0, x1, y1, Math.max(a.def.wide, b.def.wide)];
    }
    if (best) out.push(best);
  }
  return out;
}

/**
 * A vent put down by hand (a geyser) throws a car as a takeoff does, off flat ground: with a
 * landing ahead of it, it is the near side of a gap too. These are those vents, as takeoffs of
 * no height that end where the vent does.
 */
export function ventPieces(v: VenueManifest, content: Content): LeapPiece[] {
  const out: LeapPiece[] = [];
  const cx = v.oval ? v.oval.cx : v.size.w / 2;
  const cy = v.oval ? v.oval.cy : v.size.h / 2;
  for (const r of v.scenery) {
    if (r.rule !== 'place') continue;
    for (const i of r.items) {
      const P = content.prop.get(i.prop)?.pad;
      if (P?.kind !== 'vent') continue;
      const def: LeapManifest = { way: 'up', long: P.long, wide: P.wide, high: 0, lift: 0, min: 0 };
      out.push({ x: cx + i.x, y: cy + i.y, rot: i.rot, def });
    }
  }
  return out;
}

/** Every gap venue `v` has a jump over: from its takeoffs, and from vents laid before a landing. */
export function jumpGaps(
  v: VenueManifest,
  content: Content,
): [number, number, number, number, number][] {
  return leapGaps([...leapPieces(v, content), ...ventPieces(v, content)]);
}
