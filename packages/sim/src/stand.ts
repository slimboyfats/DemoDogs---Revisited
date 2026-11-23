import type { PropManifest } from '@demodogs/shared';
import type { StaticProp } from './entities';
import type { World } from './world';

/** Stand a static prop in the world. */
export function stand(
  w: World,
  def: PropManifest,
  x: number,
  y: number,
  rot: number,
  seed: number,
): StaticProp {
  const s: StaticProp = {
    index: w.statics.length,
    def,
    made: def.made ? (w.content.material.get(def.made) ?? null) : null,
    x,
    y,
    rot,
    seed,
  };
  if (def.integrity !== undefined) s.hp = def.integrity;
  if (def.crown) s.leaves = 1;
  if (def.storeys) s.storeys = def.storeys;
  w.statics.push(s);
  return s;
}
