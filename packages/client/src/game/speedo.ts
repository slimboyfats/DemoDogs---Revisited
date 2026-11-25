/** Where the speedometer sits on the race screen. */
export type DialPlace = 'middle' | 'left' | 'top';
export const DIAL_PLACES: readonly DialPlace[] = ['middle', 'left', 'top'];
/** What the menus call each place. */
export const DIAL_PLACE_NAMES: Record<DialPlace, string> = {
  middle: 'BOTTOM MIDDLE',
  left: 'BOTTOM LEFT',
  top: 'TOP MIDDLE',
};
/** How big it can be drawn, as a share of its own size, and the slider's step. */
export const DIAL_SIZE = { min: 0.6, max: 1.8, step: 0.1 } as const;

export interface DialSetup {
  on: boolean;
  place: DialPlace;
  size: number;
}

export const DIAL_DEFAULT: DialSetup = { on: true, place: 'middle', size: 1 };

const SAVE = 'demodogs.speedo';

/** A plain key-value store: localStorage, or anything like it. */
interface Store {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

/** A setup from whatever was written down: anything missing or wrong is the default. */
export function fitDial(raw: unknown): DialSetup {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const size =
    typeof o.size === 'number' && Number.isFinite(o.size)
      ? Math.round(Math.min(DIAL_SIZE.max, Math.max(DIAL_SIZE.min, o.size)) * 10) / 10
      : DIAL_DEFAULT.size;
  return {
    on: typeof o.on === 'boolean' ? o.on : DIAL_DEFAULT.on,
    place: DIAL_PLACES.includes(o.place as DialPlace) ? (o.place as DialPlace) : DIAL_DEFAULT.place,
    size,
  };
}

/**
 * The speedometer's own settings: shown or not, where, and how big. This screen's business only,
 * saved on the device; the SPEEDOMETER buttons in the menus and the size slider in the pause
 * menu change it.
 */
export class Speedo {
  setup: DialSetup = { ...DIAL_DEFAULT };

  constructor(private readonly store?: Store) {
    try {
      const s = store?.getItem(SAVE);
      if (s) this.setup = fitDial(JSON.parse(s));
    } catch {
      /* nothing saved, or nonsense: the default */
    }
  }

  toggle(): void {
    this.set({ on: !this.setup.on });
  }

  /** On to the next place (and shown, if it was off). */
  nextPlace(): void {
    const i = DIAL_PLACES.indexOf(this.setup.place);
    this.set({ on: true, place: DIAL_PLACES[(i + 1) % DIAL_PLACES.length]! });
  }

  set(change: Partial<DialSetup>): void {
    this.setup = fitDial({ ...this.setup, ...change });
    try {
      this.store?.setItem(SAVE, JSON.stringify(this.setup));
    } catch {
      /* not saved, still works for this visit */
    }
  }
}

/**
 * Where the dial's middle goes on a W by H screen, with `r` its radius in screen px and `u`
 * screen px to a CSS px, and whether the word under it says why it is slow below the dial
 * (at the top of the screen) rather than above it.
 */
export function dialSpot(
  place: DialPlace,
  W: number,
  H: number,
  r: number,
  u: number,
): { x: number; y: number; below: boolean } {
  // (the plate reaches r + a little out from the middle, and 0.7 r below it at the sides)
  const plate = r * 1.22;
  switch (place) {
    case 'left':
      // (over the stick's DRAG TO DRIVE hint)
      return { x: 14 * u + plate, y: H - r * 0.85 - 34 * u, below: false };
    case 'top':
      // under the row of world modifier chips
      return { x: W / 2, y: 34 * u + plate, below: true };
    default:
      return { x: W / 2, y: H - r * 0.85 - 12 * u, below: false };
  }
}
