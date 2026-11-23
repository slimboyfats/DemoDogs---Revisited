import {
  SceneryRuleSchema,
  TRACK_FORMAT,
  TRACK_MARGIN,
  TRACK_VERSION,
  VenueSchema,
  type SceneryRule,
  type TrackFile,
  type VenueManifest,
} from '@demodogs/shared';
import { sceneryRefs, type Content } from './content';
import { sampleTrack } from './track';

/**
 * Tracks built in the track creator. A saved track (TrackFile) is turned into an ordinary venue,
 * `venue.custom-<its id>`, in a copy of the content, so the world, the bots and the client race it
 * like any venue that ships with the game, and the game's own list of venues never changes.
 */

/** Rules that dress any road, wherever it runs: the ones a custom track can borrow from a venue. */
const DRESSING = new Set<SceneryRule['rule']>([
  'bend-wall',
  'canopy',
  'build',
  'arch',
  'patches',
  'barricade',
  'scatter',
  'roadside',
  'border',
  'towers',
  'kerb',
]);

/** The id a track races under. */
export function customVenueId(trackId: string): string {
  return `venue.custom-${trackId}`;
}

/** A venue's look for a custom track: its rules that fit any road, all switched on. */
export function dressingOf(v: VenueManifest): TrackFile['dressing'] {
  return v.scenery
    .filter((r) => DRESSING.has(r.rule))
    .map((r) => ({ on: true, rule: structuredCloneRule(r) }));
}

function structuredCloneRule(r: SceneryRule): SceneryRule {
  return JSON.parse(JSON.stringify(r)) as SceneryRule;
}

/** A fresh track that looks like venue `look`: an easy loop to start pulling about. */
export function newTrack(look: VenueManifest, id: string, name: string): TrackFile {
  const w = 1400;
  const h = 960;
  const points: [number, number][] = [];
  const n = 10;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2 + Math.PI;
    // a rounded loop with a waist, so it is not a plain oval
    const q = 1 - 0.16 * Math.cos(t * 2) ** 2;
    points.push([
      Math.round(w / 2 + Math.cos(t) * (w / 2 - 190) * q),
      Math.round(h / 2 + Math.sin(t) * (h / 2 - 190) * q),
    ]);
  }
  return {
    format: TRACK_FORMAT,
    version: TRACK_VERSION,
    id,
    name,
    laps: 3,
    seed: look.seed,
    size: { w, h },
    road: { width: look.track?.road ?? 72, points },
    colors: { ...look.colors },
    look: look.id,
    dressing: dressingOf(look),
    items: [],
    pools: [],
    bots: Math.min(10, look.bots.count),
    pickups: [...look.pickups],
  };
}

/** What stops a track being raced, in words for the person building it. Empty: it is fine. */
export function trackProblems(t: TrackFile): string[] {
  const out: string[] = [];
  const { w, h } = t.size;
  const T = sampleTrack(t.road.points, 4);
  if (T.n < 160) out.push('The road is too short for a race: pull the points further apart.');
  let outside = false;
  const m = TRACK_MARGIN + t.road.width / 2 - 30;
  for (let i = 0; i < T.n; i++)
    if (T.x[i]! < m || T.y[i]! < m || T.x[i]! > w - m || T.y[i]! > h - m) outside = true;
  if (outside)
    out.push('The road runs off the map: move it in from the edge or make the map bigger.');
  return out;
}

/** Keep a road point on the map, clear of the fence. */
export function clampPoint(t: TrackFile, x: number, y: number): [number, number] {
  const m = TRACK_MARGIN + t.road.width / 2;
  return [
    Math.round(Math.min(t.size.w - m, Math.max(m, x))),
    Math.round(Math.min(t.size.h - m, Math.max(m, y))),
  ];
}

export interface Installed {
  /** The content with the track in it as a venue: what to build the world from. */
  content: Content;
  /** The venue id to race. */
  venue: string;
  laps: number;
  /** What the track names that this build does not have, left out. */
  dropped: string[];
}

/**
 * Turn a saved track into a venue, in a copy of the content (the content given is not touched).
 * Whatever it names that this build does not know is left out and reported, so an old track still
 * loads after the game's content has changed.
 */
export function installTrack(content: Content, t: TrackFile): Installed {
  const dropped = new Set<string>();
  const first = <T extends { id: string }>(items: Iterable<T>): T | undefined =>
    [...items].sort((a, b) => (a.id < b.id ? -1 : 1))[0];
  const mode = first([...content.mode.values()].filter((m) => m.kind === 'race'));
  const bot = first(content.bot.values());
  if (!mode || !bot) throw new Error('the content has no race mode or no bot');

  const scenery: SceneryRule[] = [];
  for (const d of t.dressing) {
    if (!d.on) continue;
    const r = SceneryRuleSchema.safeParse(d.rule);
    const name = String((d.rule as { rule?: unknown } | null)?.rule ?? 'rule');
    if (!r.success) {
      dropped.add(name);
      continue;
    }
    const refs = sceneryRefs(r.data);
    const missing = [
      ...refs.prop.filter((p) => !content.prop.has(p)),
      ...refs.material.filter((m) => !content.material.has(m)),
    ];
    if (missing.length) {
      for (const m of missing) dropped.add(m);
      continue;
    }
    scenery.push(r.data);
  }
  const pools = t.pools.filter((p) => content.material.has(p.material) || !dropped.add(p.material));
  if (pools.length) scenery.push({ rule: 'pools', items: pools.map((p) => ({ ...p })) });
  // the place rule counts from the middle of the map
  const items = t.items.filter((i) => content.prop.has(i.prop) || !dropped.add(i.prop));
  if (items.length)
    scenery.push({
      rule: 'place',
      items: items.map((i) => ({
        prop: i.prop,
        x: i.x - t.size.w / 2,
        y: i.y - t.size.h / 2,
        rot: i.rot,
      })),
    });
  let pickups = (t.pickups ?? []).filter((p) => content.pickup.has(p) || !dropped.add(p));
  if (pickups.length === 0) pickups = [...content.pickup.keys()].sort();

  const id = customVenueId(t.id);
  const venue = VenueSchema.parse({
    id,
    schemaVersion: 1,
    meta: {
      name: t.name,
      description: 'Race. Built in the track creator.',
      since: 'core@0.0.0',
    },
    mode: mode.id,
    seed: t.seed,
    size: t.size,
    track: { road: t.road.width, points: t.road.points },
    colors: t.colors,
    scenery,
    bots: { bot: bot.id, count: t.bots },
    pickups,
  });
  return {
    content: { ...content, venue: new Map(content.venue).set(id, venue) },
    venue: id,
    laps: t.laps,
    dropped: [...dropped].sort(),
  };
}
