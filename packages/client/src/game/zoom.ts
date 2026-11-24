export type ZoomMode = 'close' | 'normal' | 'wide';
export const ZOOM_MODES: readonly ZoomMode[] = ['close', 'normal', 'wide'];

/**
 * The zooms by name, as art pixels up the short side of the screen. NORMAL is what the race
 * camera has been since it was pulled back; CLOSE is where it was before that; WIDE shows about
 * half as much again. Anything between them can be picked too (the slider).
 */
export const VIEWS: Record<ZoomMode, number> = { close: 130, normal: 175, wide: 250 };
/** Art pixels along the long side for each one up the short side. */
const LONG = 310 / 175;

/** The short side of a canvas, or what its long side allows if that is less. */
const room = (short: number, long: number): number => Math.min(short, long / LONG);

/**
 * Canvas pixels per art pixel when driving with `view` art pixels up the short side, on a canvas
 * `short` by `long`. Always a whole or a half number, so the pixels stay square and sharp at every
 * zoom; never under two, or one and a half past NORMAL.
 */
export function driveScale(view: number, short: number, long: number): number {
  const least = view > VIEWS.normal ? 1.5 : 2;
  return Math.max(least, Math.round((room(short, long) / view) * 2) / 2);
}

/** Every scale this canvas can be driven at, closest first: the stops of the slider. */
export function zoomStops(short: number, long: number): number[] {
  const out: number[] = [];
  const far = driveScale(VIEWS.wide, short, long);
  for (let k = driveScale(VIEWS.close, short, long); k >= far; k -= 0.5) out.push(k);
  return out;
}

const SAVE = 'demodogs.zoom';

/** A plain key-value store: localStorage, or anything like it. */
interface Store {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

/** A zoom as written down: a name, or art pixels up the short side. Null for nonsense. */
function parse(s: string | null | undefined): number | null {
  if (!s) return null;
  if (ZOOM_MODES.includes(s as ZoomMode)) return VIEWS[s as ZoomMode];
  const n = Number(s);
  return n >= VIEWS.close && n <= VIEWS.wide ? n : null;
}

/**
 * How far out the race camera sits, from CLOSE through NORMAL to WIDE. It is this screen's own
 * business (how much of the world it draws), so an online race is the same race at any zoom. The
 * choice is saved on the device; `?zoom=close|normal|wide` picks one for a visit without saving.
 */
export class CameraZoom {
  /** Art pixels up the short side of the screen. */
  view = VIEWS.normal;

  constructor(
    private readonly store?: Store,
    forced?: string | null,
  ) {
    let saved: string | null = null;
    try {
      saved = store?.getItem(SAVE) ?? null;
    } catch {
      /* private mode: normal */
    }
    this.view = parse(forced) ?? parse(saved) ?? VIEWS.normal;
  }

  /** Canvas pixels per art pixel on this canvas, now. */
  scale(short: number, long: number): number {
    return driveScale(this.view, short, long);
  }

  /** Which of this canvas's stops is on. */
  stop(short: number, long: number): number {
    const stops = zoomStops(short, long);
    const at = stops.indexOf(this.scale(short, long));
    return at < 0 ? stops.length - 1 : at;
  }

  /** Pick one of this canvas's stops (the slider), saved. */
  setStop(i: number, short: number, long: number): void {
    const stops = zoomStops(short, long);
    const k = stops[Math.max(0, Math.min(stops.length - 1, Math.round(i)))]!;
    // a stop that is what a name gives is kept as that name's view, so NORMAL stays NORMAL
    const named = ZOOM_MODES.find((m) => driveScale(VIEWS[m], short, long) === k);
    const view = named ? VIEWS[named] : room(short, long) / k;
    this.put(Math.max(VIEWS.close, Math.min(VIEWS.wide, view)));
  }

  /** The name of the zoom that is on, or null between names. */
  name(short: number, long: number): ZoomMode | null {
    const k = this.scale(short, long);
    // NORMAL first: where two names come to the same thing on a small screen, it is the one meant
    return (
      (['normal', 'close', 'wide'] as const).find((m) => driveScale(VIEWS[m], short, long) === k) ??
      null
    );
  }

  /** The next named zoom round (the button), saved. */
  next(): void {
    const at = ZOOM_MODES.findIndex((m) => VIEWS[m] >= this.view);
    const on = VIEWS[ZOOM_MODES[at]!] === this.view;
    this.put(VIEWS[ZOOM_MODES[(on ? at + 1 : at) % ZOOM_MODES.length]!]);
  }

  private put(view: number): void {
    this.view = view;
    try {
      this.store?.setItem(SAVE, String(Math.round(view * 100) / 100));
    } catch {
      /* not saved, still works for this visit */
    }
  }
}
