import { resolveContent, type Content } from '@demodogs/sim';
import type { LookModule } from '@demodogs/shared';
import { discoverContent, discoverLooks } from './glob';

export { discoverContent, discoverLooks, itemFolders } from './glob';
export { GLOWS, PALETTE } from './palette';
export * as kit from './kit';

let cached: Content | undefined;
let looks: Map<string, LookModule> | undefined;

/** Resolve every shipped pack once (throws ContentError listing every problem). */
export function loadContent(): Content {
  cached ??= resolveContent(discoverContent());
  return cached;
}

/** Every item's look, by id. */
export function loadLooks(): Map<string, LookModule> {
  looks ??= discoverLooks();
  return looks;
}
