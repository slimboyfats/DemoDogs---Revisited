import type { PropManifest } from '@demodogs/shared';
import { spawnCritters } from './critters';
import type { StaticProp } from './entities';
import type { Rng } from './prng';
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
  w.stood++;
  // (a piece of track laid off the road is ground, not a tile that does something)
  if (def.pad) (def.pad.kind === 'road' ? w.paths : w.pads).push(s);
  if (def.pad?.kind === 'road' && def.pad.wobble) w.wobbly = true;
  if (def.mound) w.mounds.push(s);
  if (def.leap?.way === 'up' && def.leap.lift > 0) w.leaps.push(s);
  if (def.gate) w.gates.push(s);
  return s;
}

/**
 * Put any prop down at (x, y) turned `rot`, whatever kind it is: scenery that stands (returned),
 * something loose that can be shoved, or a group of animals. Scenery rules, the test range and
 * the track creator all go through here, so a prop that can be named can be placed.
 */
export function putProp(
  w: World,
  def: PropManifest,
  x: number,
  y: number,
  rot: number,
  rng: Rng,
): StaticProp | null {
  if (def.critter) {
    spawnCritters(w, def, x, y, rot, rng);
    return null;
  }
  if (def.body === 'static') return stand(w, def, x, y, rot, rng.range(0, 10));
  w.props.push({
    index: w.props.length,
    def,
    x,
    y,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    rot,
    spin: 0,
    alive: true,
    fuse: 0,
    owner: -1,
  });
  return null;
}
