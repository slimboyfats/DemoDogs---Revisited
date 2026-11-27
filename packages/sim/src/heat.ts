import { DT } from '@demodogs/shared';
import type { Car } from './entities';
import { damage } from './damage';
import { fireproof } from './guards';
import { pathAt } from './pads';
import type { World } from './world';

/** Seconds between two bites a scalding pool takes out of a car in it. */
const BITE = 0.25;

/**
 * What the pool car c stands in costs it in armour each second (a material's `scalds`: lava), or
 * 0: on cool ground, in the air, up on a deck, on a path laid over the pool or on ground raised
 * out of it.
 */
export function scalding(w: World, c: Car): number {
  if (w.spills.length === 0 || c.deck > 0 || c.z > 2 || c.buried) return 0;
  let hot = 0;
  for (const s of w.spills) {
    const k = s.def.scalds;
    if (k === undefined || k <= hot) continue;
    if (Math.abs(s.x - c.x) > s.r || Math.hypot(s.x - c.x, s.y - c.y) > s.r) continue;
    hot = k;
  }
  if (hot <= 0) return 0;
  if ((w.relief?.platAt(c.x, c.y) ?? 0) > 1 || (w.paths.length && pathAt(w, c.x, c.y))) return 0;
  return hot;
}

/**
 * A car in a pool that scalds burns for as long as it stays: a bite of armour every quarter of
 * a second, nobody's kill. The world is told as it goes in and as it comes out, and the car says
 * so itself while it is in (`HELD.hot`, set in physics). A fireproof car drives through unhurt.
 */
export function updateScald(w: World, c: Car): void {
  const hot = c.wrecked ? 0 : scalding(w, c);
  const was = c.scald ?? 0;
  if (hot <= 0) {
    if (was > 0) {
      c.scald = 0;
      w.emit({ t: 'scald', car: c.index, x: c.x, y: c.y, out: true });
    }
    return;
  }
  if (was <= 0) w.emit({ t: 'scald', car: c.index, x: c.x, y: c.y });
  const now = was + DT;
  c.scald = now;
  // (the first bite as it goes in, then one each beat)
  if (Math.floor(now / BITE) !== Math.floor(was / BITE) || was <= 0)
    if (!fireproof(c)) damage(w, c, hot * BITE, null, c.x, c.y);
}
