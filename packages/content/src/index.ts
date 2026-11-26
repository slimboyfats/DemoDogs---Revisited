import { resolveContent, type Content } from '@demodogs/sim';
import { VenueSchema, type LookModule } from '@demodogs/shared';
import plainBowl from './fixtures/bench-pit.json';
import schoolLawn from './fixtures/school.json';
import { discoverContent, discoverLooks } from './glob';

export { discoverContent, discoverLooks, itemFolders } from './glob';
export { GLOSS, GLOWS, PALETTE } from './palette';
export * as kit from './kit';

let cached: Content | undefined;
let looks: Map<string, LookModule> | undefined;

/** Resolve every shipped pack once (throws ContentError listing every problem). */
export function loadContent(): Content {
  cached ??= resolveContent(discoverContent());
  return cached;
}

/** The test range's own venue: a plain bowl that is not one of the game's arenas. */
export const RANGE = 'venue.range';

/**
 * The content with the test range's bowl in it. The range is where things are staged to be
 * looked at, so it stays bare and flat whatever is done to the game's derby arenas: it is a venue
 * of its own, in a copy of the content, and never on the game's list.
 */
export function withRange(content: Content): Content {
  const venue = VenueSchema.parse({
    ...plainBowl,
    id: RANGE,
    meta: { ...plainBowl.meta, name: 'Test Range', description: 'A plain bowl to try things in.' },
  });
  return { ...content, venue: new Map(content.venue).set(RANGE, venue) };
}

/** The driving lesson's own venue: a fenced lawn that is not one of the game's arenas. */
export const SCHOOL = 'venue.school';

/**
 * The content with the driving lesson's lawn in it, in a copy like the range's. In the copy an
 * arms crate holds only the plainest weapon there is to learn on (the rocket, which flies
 * straight out of the nose), so the lesson's one crate never hands a new driver a puzzle.
 */
export function withSchool(content: Content): Content {
  const venue = VenueSchema.parse(schoolLawn);
  const rocket =
    content.weapon.get('weapon.rocket') ??
    [...content.weapon.values()]
      .filter((w) => w.kind === 'rocket')
      .sort((a, b) => (a.id < b.id ? -1 : 1))[0];
  const pickup = new Map(content.pickup);
  if (rocket)
    for (const id of venue.pickups) {
      const p = pickup.get(id);
      if (p?.weapons) pickup.set(id, { ...p, weapons: [rocket.id] });
    }
  return { ...content, venue: new Map(content.venue).set(SCHOOL, venue), pickup };
}

/** Every item's look, by id. */
export function loadLooks(): Map<string, LookModule> {
  looks ??= discoverLooks();
  return looks;
}
