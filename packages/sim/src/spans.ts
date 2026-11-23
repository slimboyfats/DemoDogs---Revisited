import { DT } from '@demodogs/shared';
import type { StaticProp } from './entities';
import type { World } from './world';

/**
 * What holds a raised road up. A bridge is a beam: a row of deck pieces (`link` is each one's
 * place in the row) standing on legs (each `holds` one piece of the row) or resting on the
 * ground (`rests`). A piece stays up while the row from it to a held piece on BOTH sides is
 * unbroken, with every piece between that was built on legs still on them; or while it is
 * within `OVERHANG` pieces of a held one, hanging off it. Anything else has nothing under it:
 * it sags, and comes down a moment later, the break running out along the row from where it
 * began.
 */

/** How many pieces of deck can hang off a held one with nothing at their far end. */
export const OVERHANG = 1;
/** A piece that has lost its footing comes down after this long, and this much later per piece from the break. */
export const SAG = 0.3;
export const SAG_STEP = 0.09;

/** The next free beam number. */
export function nextBeam(w: World): number {
  return w.statics.reduce((m, s) => Math.max(m, (s.beam ?? -1) + 1), 0);
}

interface Beam {
  pieces: StaticProp[];
  /** The legs under each piece. */
  legs: StaticProp[][];
}

const cache = new WeakMap<World, { n: number; beams: Map<number, Beam> }>();

function beams(w: World): Map<number, Beam> {
  let c = cache.get(w);
  if (c && c.n === w.statics.length) return c.beams;
  const map = new Map<number, Beam>();
  const of = (b: number) => {
    let B = map.get(b);
    if (!B) map.set(b, (B = { pieces: [], legs: [] }));
    return B;
  };
  for (const s of w.statics)
    if (s.beam !== undefined && s.link !== undefined) of(s.beam).pieces[s.link] = s;
  for (const B of map.values()) {
    // scenery rules that clear the ground (a river) may have taken pieces out: close the row up
    B.pieces = B.pieces.filter(Boolean);
    B.legs = B.pieces.map(() => []);
  }
  for (const s of w.statics) {
    if (s.beam === undefined || s.holds === undefined) continue;
    const B = of(s.beam);
    const i = B.pieces.findIndex((p) => p.link === s.holds);
    if (i >= 0) B.legs[i]!.push(s);
  }
  c = { n: w.statics.length, beams: map };
  cache.set(w, c);
  return c.beams;
}

/** Legs hold while fewer than half of them are gone: one of a pair is not enough. */
function legsHold(legs: readonly StaticProp[]): boolean {
  let gone = 0;
  for (const l of legs) if (l.down) gone++;
  return legs.length > 0 && gone * 2 < legs.length;
}

/**
 * Which pieces of a beam have something under them. `up` says which pieces are there to carry
 * load along the row; `firm` which of those could themselves be stood on.
 */
function carried(
  B: Beam,
  up: (s: StaticProp) => boolean,
  firm: (s: StaticProp) => boolean,
): boolean[] {
  const n = B.pieces.length;
  const far = 1e9;
  const dist = [new Array<number>(n), new Array<number>(n)];
  const clean = [new Array<boolean>(n), new Array<boolean>(n)];
  for (const side of [0, 1]) {
    let d = far;
    let ok = false;
    for (let k = 0; k < n; k++) {
      const i = side ? n - 1 - k : k;
      const p = B.pieces[i]!;
      const built = p.rests === true || B.legs[i]!.length > 0;
      if (!up(p)) d = far;
      else if (firm(p) && (p.rests === true || legsHold(B.legs[i]!))) {
        d = 0;
        ok = true;
      } else {
        if (d < far) d++;
        // it was built on legs and they are gone: nothing spans across it any more
        if (built) ok = false;
      }
      dist[side]![i] = d;
      clean[side]![i] = ok;
    }
  }
  return B.pieces.map((p, i) => {
    if (!up(p)) return false;
    const l = dist[0]![i]!;
    const r = dist[1]![i]!;
    return l <= OVERHANG || r <= OVERHANG || (l < far && r < far && clean[0]![i]! && clean[1]![i]!);
  });
}

const standing = (s: StaticProp) => !s.down && s.sagT === undefined;

/**
 * Part of a bridge (a deck piece or a leg) has just come down: whatever that leaves with
 * nothing under it starts to go. Returns how many pieces it took with it.
 */
export function giveWay(w: World, s: StaticProp): number {
  if (s.beam === undefined) return 0;
  const B = beams(w).get(s.beam);
  if (!B) return 0;
  const link = s.holds ?? s.link;
  const from = Math.max(
    0,
    B.pieces.findIndex((p) => p.link === link),
  );
  const ok = carried(B, standing, standing);
  let n = 0;
  B.pieces.forEach((p, i) => {
    if (ok[i] || !standing(p)) return;
    p.sagT = SAG + SAG_STEP * Math.abs(i - from);
    p.sag = 0;
    w.sagging.push(p);
    n++;
  });
  if (n) w.emit({ t: 'sag', prop: s.index, x: s.x, y: s.y, pieces: n });
  return n;
}

/**
 * Could this fallen deck piece stand if it were built again now? Yes if what it would rest on
 * is really there, counting the rest of the row that is on its way back as there to span.
 */
export function wouldHold(w: World, s: StaticProp): boolean {
  if (s.beam === undefined || s.link === undefined) return true;
  const B = beams(w).get(s.beam);
  if (!B) return true;
  const i = B.pieces.indexOf(s);
  if (i < 0) return true;
  const firm = (p: StaticProp) => p === s || standing(p);
  const up = (p: StaticProp) => firm(p) || (p.down === true && p.mendT !== undefined);
  return carried(B, up, firm)[i]!;
}

/** Sagging pieces sink until their time is up, then come down where they hang. */
export function updateSagging(w: World, fall: (w: World, s: StaticProp) => void): void {
  for (let i = w.sagging.length - 1; i >= 0; i--) {
    const s = w.sagging[i]!;
    if (s.down || s.sagT === undefined) {
      w.sagging.splice(i, 1);
      continue;
    }
    s.sag = (s.sag ?? 0) + DT;
    s.sagT -= DT;
    if (s.sagT > 0) continue;
    w.sagging.splice(i, 1);
    fall(w, s);
  }
}
