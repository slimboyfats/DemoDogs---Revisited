import { stand } from './scenery';
import type { PickupManifest, PropManifest, WeaponManifest } from '@demodogs/shared';
import { grant } from './things';
import { damage, explode, wreck } from './damage';
import type { Car } from './entities';
import { lockOn } from './payloads';
import type { World } from './world';
import { firePulse } from './shock';

/**
 * What a test range lets you do to a world by hand: set off blasts, fire weapons from anywhere,
 * hit, wreck, mend and move cars, and put props down. Everything goes through the same rules as
 * a race (the same `explode`, `damage` and `wreck`), so what you see here is what a race does.
 */

/** A blast at (x, y), nobody's. */
export function rangeBlast(w: World, x: number, y: number, power: number): void {
  explode(w, x, y, power, null);
}

/** A rocket from (x, y) flying along heading h, as if `owner` fired it. */
export function rangeRocket(
  w: World,
  def: WeaponManifest,
  owner: Car,
  x: number,
  y: number,
  h: number,
): void {
  const r = { x, y, h, v: def.speed ?? 340, owner: owner.index, life: def.life ?? 2, def };
  lockOn(w, r);
  w.rockets.push(r);
  w.emit({ t: 'fire', car: owner.index, weapon: def.id });
}

/** A mine laid at (x, y). It is nobody's friend: `owner` sets it off too once it has armed. */
export function rangeMine(w: World, def: WeaponManifest, owner: Car, x: number, y: number): void {
  w.mines.push({ x, y, owner: owner.index, t: 2, def });
}

/** A blow of `amount` to a car at the point (x, y). */
export function rangeHit(w: World, c: Car, amount: number, x: number, y: number): void {
  damage(w, c, amount, null, x, y);
}

/** Hand a car a pickup, as if it had driven over one that rolled `def`. */
export function rangeGive(w: World, c: Car, def: PickupManifest): void {
  if (c.wrecked) return;
  const label = grant(w, c, def);
  w.emit({ t: 'pickup', car: c.index, x: c.x, y: c.y, label, kind: def.kind });
}

export function rangeWreck(w: World, c: Car): void {
  if (!c.wrecked) wreck(w, c, null);
}

/** Make a car whole again where it stands. */
export function rangeMend(w: World, c: Car): void {
  c.has = { front: true, rear: true, top: true };
  c.hp = 100;
  c.wrecked = false;
  c.invuln = 0;
  c.spin = 0;
  c.weldT = c.weldRate = 0;
  w.emit({ t: 'respawn', car: c.index });
}

/** Put a car down at (x, y), standing still. */
export function rangeMove(c: Car, x: number, y: number, h = c.h): void {
  c.x = x;
  c.y = y;
  c.h = h;
  c.vx = c.vy = c.vz = c.z = c.spin = c.vf = 0;
}

/** Put a prop down at (x, y): scenery if it is static, otherwise something that can be shoved. */
export function rangeProp(w: World, def: PropManifest, x: number, y: number, rot = 0): void {
  if (def.body === 'static') stand(w, def, x, y, rot, w.rng.range(0, 10));
  else
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
}

/** A shock pulse from `owner`'s car, as if it had been fired there and then. */
export function rangePulse(w: World, def: WeaponManifest, owner: Car): void {
  firePulse(w, owner, def);
  w.emit({ t: 'fire', car: owner.index, weapon: def.id });
}
