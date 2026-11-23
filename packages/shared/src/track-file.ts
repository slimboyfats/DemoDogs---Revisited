import { z } from 'zod';
import { VenueSchema } from './manifests';

/**
 * A track somebody built in the track creator, as it is saved: one JSON document that holds
 * everything needed to race it. It is the editor's own model, not a venue manifest: the road, the
 * things put down by hand at map coordinates, and the look (colours and the rules that dress the
 * rest of the map). `installTrack` in the sim turns it into a venue.
 *
 * It names content by id and is read forgivingly: a prop or rule this build does not know is left
 * out when the track is loaded, never an error. `id` is the track's own key, for a database later.
 */
export const TRACK_FORMAT = 'demodogs-track';
export const TRACK_VERSION = 1;

/** The map's edge is fenced: nothing of the road may come nearer to it than this. */
export const TRACK_MARGIN = 70;

export const TrackFileSchema = z.object({
  format: z.literal(TRACK_FORMAT),
  version: z.literal(TRACK_VERSION),
  /** Its key wherever it is kept. */
  id: z.string().regex(/^[a-z0-9-]{4,40}$/),
  name: z.string().trim().min(1).max(32),
  author: z.string().max(32).optional(),
  /** ISO times, set by whoever saves it. */
  created: z.string().max(40).optional(),
  updated: z.string().max(40).optional(),
  laps: z.number().int().min(1).max(20),
  /** The seed the dressing rules lay the scenery out with. */
  seed: z.number().int(),
  size: VenueSchema.shape.size,
  /** The road's centre line (a closed curve through the points; the start line is at the first). */
  road: z.strictObject({
    width: z.number().min(40).max(120),
    points: z
      .array(z.tuple([z.number(), z.number()]))
      .min(4)
      .max(80),
  }),
  colors: VenueSchema.shape.colors,
  /** The venue whose look it was given, if any (a note for the editor). */
  look: z.string().max(60).optional(),
  /** Scenery rules that fill in the rest of the map, each of which can be switched off. */
  dressing: z.array(z.strictObject({ on: z.boolean(), rule: z.unknown() })).max(40),
  /** Things put down by hand: a prop at map coordinates, turned `rot` radians. */
  items: z
    .array(z.strictObject({ prop: z.string(), x: z.number(), y: z.number(), rot: z.number() }))
    .max(1200),
  /** Pools laid by hand: mud, ice, oil. */
  pools: z
    .array(
      z.strictObject({
        material: z.string(),
        x: z.number(),
        y: z.number(),
        r: z.number().min(4).max(80),
      }),
    )
    .max(200),
  /**
   * Bridges: the stretch of road nearest to (x, y) climbs onto a raised deck `length` long, so the
   * road can cross over itself. Each follows the road when it is moved.
   */
  bridges: z
    .array(z.strictObject({ x: z.number(), y: z.number(), length: z.number().min(80).max(600) }))
    .max(6)
    .default([]),
  /** How many scrap bots wander it. */
  bots: z.number().int().min(0).max(40),
  /** The crates' pickups; none listed means all of them. */
  pickups: z.array(z.string()).max(80).optional(),
});
export type TrackFile = z.infer<typeof TrackFileSchema>;

/** Read a saved track from its JSON text (or an object already parsed). */
export function parseTrackFile(
  src: unknown,
): { ok: true; track: TrackFile } | { ok: false; error: string } {
  let data = src;
  if (typeof src === 'string')
    try {
      data = JSON.parse(src);
    } catch {
      return { ok: false, error: 'This is not a JSON file.' };
    }
  if (
    typeof data !== 'object' ||
    data === null ||
    (data as { format?: unknown }).format !== TRACK_FORMAT
  )
    return { ok: false, error: 'This is not a DemoDogs track file.' };
  const v = (data as { version?: unknown }).version;
  if (typeof v === 'number' && v > TRACK_VERSION)
    return { ok: false, error: 'This track was saved by a newer version of the game.' };
  const r = TrackFileSchema.safeParse(data);
  if (r.success) return { ok: true, track: r.data };
  const i = r.error.issues[0];
  return { ok: false, error: `The track file is damaged (${i?.path.join('.')}: ${i?.message}).` };
}
