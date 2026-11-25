/** The most canvas pixels drawn per CSS pixel: past this a phone pays for detail nobody sees. */
const TOP = 2;
/** The fewest canvas pixels up the short side of the screen: below it an art pixel is under two. */
const LEAST = 330;
/** How many steps there are below full. */
const DROPS = 2;

export type ResMode = 'auto' | 'full' | 'low';
export const RES_MODES: readonly ResMode[] = ['auto', 'full', 'low'];

/**
 * The resolutions the game can be drawn at on a screen, sharpest first, as canvas pixels per CSS
 * pixel. The first is what it has always been (the device's own, at most two). Each one below is
 * the device's pixels divided by a whole number, so a canvas pixel covers a whole block of screen
 * pixels and stays square (after loktar00/sprite-stack-engine's internal resolution: the cost of
 * a frame goes with the pixels filled, so this is the biggest lever a slow GPU has).
 */
export function resSteps(dpr: number, shortCss: number): number[] {
  const d = dpr > 0 ? dpr : 1;
  const steps = [Math.min(TOP, d)];
  for (let n = 1; n <= 8 && steps.length <= DROPS; n++) {
    const v = d / n;
    if (v > steps[steps.length - 1]! - 0.01) continue;
    if (v * shortCss < LEAST) break;
    steps.push(v);
  }
  return steps;
}

const SAVE = 'demodogs.res';

/** A plain key-value store: localStorage, or anything like it. */
interface Store {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

/**
 * How sharp the game is drawn. AUTO starts at full and steps down by itself when the device keeps
 * falling behind, and steps back up when it has run easily for a while; FULL never steps down; LOW starts at the bottom.
 * The choice is saved on the device; `?res=auto|full|low` picks one for a visit without saving.
 */
export class Resolution {
  mode: ResMode = 'auto';
  /** Steps AUTO has gone down this visit. */
  dropped = 0;

  constructor(
    private readonly store?: Store,
    forced?: string | null,
  ) {
    let saved: string | null = null;
    try {
      saved = store?.getItem(SAVE) ?? null;
    } catch {
      /* private mode: auto */
    }
    const pick = forced ?? saved;
    if (RES_MODES.includes(pick as ResMode)) this.mode = pick as ResMode;
  }

  /** The step in use on a screen with these steps. */
  step(steps: readonly number[]): number {
    const last = steps.length - 1;
    if (this.mode === 'full') return 0;
    if (this.mode === 'low') return last;
    return Math.min(this.dropped, last);
  }

  /** Canvas pixels per CSS pixel on this screen, now. */
  pick(dpr: number, shortCss: number): number {
    const steps = resSteps(dpr, shortCss);
    return steps[this.step(steps)]!;
  }

  /** AUTO only: go down a step if there is one. True when the picture has to be laid out again. */
  drop(dpr: number, shortCss: number): boolean {
    if (this.mode !== 'auto') return false;
    if (this.dropped >= resSteps(dpr, shortCss).length - 1) return false;
    this.dropped++;
    return true;
  }

  /** AUTO only: go back up a step if one was dropped. True when the picture has to be laid out again. */
  rise(): boolean {
    if (this.mode !== 'auto' || this.dropped <= 0) return false;
    this.dropped--;
    return true;
  }

  /** The next mode round (the button), saved. */
  next(): ResMode {
    this.mode = RES_MODES[(RES_MODES.indexOf(this.mode) + 1) % RES_MODES.length]!;
    this.dropped = 0;
    try {
      this.store?.setItem(SAVE, this.mode);
    } catch {
      /* not saved, still works for this visit */
    }
    return this.mode;
  }
}
