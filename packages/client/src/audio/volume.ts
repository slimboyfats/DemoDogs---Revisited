/** The three volume sliders: everything, the tune, and the rest (engines, guns, blasts). */
export type Channel = 'master' | 'music' | 'fx';

export type Volume = Record<Channel, number>;

export const CHANNELS: readonly Channel[] = ['master', 'music', 'fx'];

export const FULL: Volume = { master: 1, music: 1, fx: 1 };

const share = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;

/** The saved volumes, with anything missing or broken left at full. */
export function readVolume(saved: string | null): Volume {
  let o: Partial<Record<Channel, unknown>> = {};
  try {
    const p: unknown = saved ? JSON.parse(saved) : null;
    if (p && typeof p === 'object') o = p;
  } catch {
    /* not ours: start at full */
  }
  return { master: share(o.master), music: share(o.music), fx: share(o.fx) };
}

/**
 * The gain for a slider at `v` (0 to 1). Loudness is heard in ratios, so the gain follows the
 * square: half way along the slider sounds about half as loud, and the quiet end has room in it.
 */
export function gainOf(v: number): number {
  const s = Math.min(1, Math.max(0, v));
  return s * s;
}
