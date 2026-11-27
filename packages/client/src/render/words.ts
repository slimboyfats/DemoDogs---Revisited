/** A word on the screen: its middle and its size, in device pixels. */
export interface Word {
  x: number;
  y: number;
  w: number;
  h: number;
}

const over = (a: Word, b: Word): boolean =>
  Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;

/**
 * Finds floating words room: each is kept whole on a `W` by `H` screen (`pad` in from its edges)
 * and clear of the ones before it in the list, stepping up a line at a time (down when the top
 * of the screen is in the way), and clear of what is `taken` already (the cars, the gauges). The
 * words are for fun, so none may lie over another, over what matters, or be cut off. Moves the
 * words given; one that finds no room in a few steps is left where it got to.
 */
export function fitWords(
  words: Word[],
  W: number,
  H: number,
  pad: number,
  taken: readonly Word[] = [],
): void {
  for (let i = 0; i < words.length; i++) {
    const a = words[i]!;
    const hw = Math.min(a.w / 2, W / 2 - pad);
    a.x = Math.min(W - pad - hw, Math.max(pad + hw, a.x));
    const lo = pad + a.h / 2;
    const hi = H - pad - a.h / 2;
    a.y = Math.min(hi, Math.max(lo, a.y));
    let dir = -1;
    for (let tries = 0; tries < 8; tries++) {
      let hit: Word | null = null;
      for (let j = 0; j < taken.length && !hit; j++) if (over(a, taken[j]!)) hit = taken[j]!;
      for (let j = 0; j < i && !hit; j++) if (over(a, words[j]!)) hit = words[j]!;
      if (!hit) break;
      let y = hit.y + (dir * (hit.h + a.h)) / 2 + dir;
      if (y < lo && dir < 0) {
        dir = 1;
        y = hit.y + (hit.h + a.h) / 2 + 1;
      }
      a.y = Math.min(hi, y);
    }
  }
}
